const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

// DB Connection
const dbConfig = {
    host: 'btw2bu9p01s29x8hplgj-mysql.services.clever-cloud.com',
    user: 'u7oaqmno7he8keou',
    password: 'RpLD6MtQImUD6trHT8hL',
    database: 'btw2bu9p01s29x8hplgj'
};

let db;

// Function to handle connection
function handleDisconnect() {
    db = mysql.createConnection(dbConfig);

    db.connect(err => {
        if (err) {
            console.error('Error connecting to database:', err.stack);
            setTimeout(handleDisconnect, 2000); // Reconnect after 2 seconds
        } else {
            console.log('Connected to database.');
        }
    });

    db.on('error', err => {
        console.error('Database error:', err.stack);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            handleDisconnect(); // Reconnect on connection loss
        } else {
            throw err;
        }
    });
}

// Initial connection
handleDisconnect();

// In-memory storage for user data
let userNames = {};
let userLanguages = {}; // Object to store the language preference of each user

// Retrieve candidates from database
function getCandidates(callback) {
    const query = 'SELECT id, name FROM candidates';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error retrieving candidates from database:', err.stack);
            callback([]);
        } else {
            const candidates = results.map(candidate => ({
                id: candidate.id,
                name: candidate.name
            }));
            callback(candidates);
        }
    });
}

// Check if the phone number belongs to an admin and retrieve admin name
function isAdmin(phoneNumber, callback) {
    const query = 'SELECT name, phone_number FROM admin WHERE phone_number = ?';
    db.query(query, [phoneNumber], (err, results) => {
        if (err) {
            console.error('Error checking admin status:', err.stack);
            callback(false, null);
        } else if (results.length > 0) {
            callback(true, results[0].name);
        } else {
            callback(false, null);
        }
    });
}

// Function to retrieve user information from votes table
function getUserInfo(phoneNumber, callback) {
    const query = 'SELECT user_name, voted_candidate_id FROM votes WHERE phone_number = ?';
    db.query(query, [phoneNumber], (err, results) => {
        if (err) {
            console.error('Error retrieving user information from database:', err.stack);
            callback(null);
        } else {
            if (results.length > 0) {
                const userInfo = {
                    name: results[0].user_name,
                    voted_candidate_id: results[0].voted_candidate_id
                };
                callback(userInfo);
            } else {
                callback(null);
            }
        }
    });
}

app.post('/ussd', (req, res) => {
    let response = '';

    // Extract USSD input
    const { sessionId, serviceCode, phoneNumber, text } = req.body;

    // Parse user input
    const userInput = text.split('*').map(option => option.trim());

    // Determine next action based on user input
    if (userInput.length === 1 && userInput[0] === '') {
        // First level menu: Language selection
        response = `CON Welcome to E-TORA portal\n`;
        response += `1. English\n`;
        response += `2. Kinyarwanda`;
    } else if (userInput.length === 1 && userInput[0] !== '') {
        // Validate language selection
        if (userInput[0] === '1' || userInput[0] === '2') {
            // Save user's language choice and check if the user is an admin
            userLanguages[phoneNumber] = userInput[0] === '1' ? 'en' : 'rw';

            isAdmin(phoneNumber, (isAdmin, adminName) => {
                if (isAdmin) {
                    // Admin menu
                    response = userLanguages[phoneNumber] === 'en' ? 
                        `CON Hello ${adminName}, choose an option:\n1. View Votes\n2. My Information` : 
                        `CON Muraho ${adminName}, Hitamo:\n1. Reba amajwi\n2. Umwirondoro wanjye`;
                } else {
                    // Prompt user to enter their name
                    response = userLanguages[phoneNumber] === 'en' ? 
                        `CON Enter your name:` : 
                        `CON Uzuza umwirondoro: \n Amazina yawe:`;
                }
                res.send(response);
            });
            return; // Return to wait for async callback
        } else {
            // Invalid language selection
            response = `END Invalid selection. Please try again.` + 
                       `\nIbyo muhisemo Ntago aribyo. Ongera ugerageze.`;
        }
    } else if (userInput.length === 2) {
        if (userLanguages[phoneNumber] && !userNames[phoneNumber]) {
            // Save user's name
            userNames[phoneNumber] = userInput[1];
        }

        // Check if the user is an admin
        isAdmin(phoneNumber, (isAdmin, adminName) => {
            if (isAdmin) {
                response = userLanguages[phoneNumber] === 'en' ? 
                    `CON Hello ${adminName}, choose an option:\n1. View Votes\n2. My Information` : 
                    `CON Muraho ${adminName}, Hitamo:\n1. Reba amajwi\n2. Umwirondoro wanjye`;
            } else {
                // Regular user menu
                response = userLanguages[phoneNumber] === 'en' ? 
                    `CON Hello ${userNames[phoneNumber]}, choose an option:\n1. Vote Candidate\n2. My Information` : 
                    `CON Muraho ${userNames[phoneNumber]}, Hitamo:\n1. Tora umukandida\n2. Umwirondoro wanjye`;
            }
            res.send(response);
        });
        return; // Return to wait for async callback
    } else if (userInput.length === 3) {
        if (userInput[2] === '1' || userInput[2] === '2') {
            isAdmin(phoneNumber, (isAdmin, adminName) => {
                if (userInput[2] === '1') {
                    if (isAdmin) {
                        // Admin viewing votes
                        const totalVotesQuery = 'SELECT COUNT(*) as total_votes FROM votes';
                        db.query(totalVotesQuery, (err, totalResults) => {
                            if (err) {
                                console.error('Error retrieving total votes from database:', err.stack);
                                response = `END Error retrieving votes.`;
                                res.send(response);
                                return;
                            }
                            const totalVotes = totalResults[0].total_votes;

                            const votesQuery = 'SELECT c.name as voted_candidate, COUNT(*) as vote_count FROM votes v JOIN candidates c ON v.voted_candidate_id = c.id GROUP BY voted_candidate';
                            db.query(votesQuery, (err, results) => {
                                if (err) {
                                    console.error('Error retrieving votes from database:', err.stack);
                                    response = `END Error retrieving votes.`;
                                } else {
                                    response = `END Votes:\n`;
                                    results.forEach(row => {
                                        const percentage = ((row.vote_count / totalVotes) * 100).toFixed(2);
                                        response += `${row.voted_candidate}: ${row.vote_count} votes (${percentage}%)\n`;
                                    });
                                }
                                res.send(response);
                            });
                        });
                        return;
                    } else {
                        // Check if the phone number has already voted in the database
                        const voteCheckQuery = 'SELECT COUNT(*) as vote_count FROM votes WHERE phone_number = ?';
                        db.query(voteCheckQuery, [phoneNumber], (err, results) => {
                            if (err) {
                                console.error('Error checking vote status:', err.stack);
                                response = userLanguages[phoneNumber] === 'en' ? 
                                    `END Error checking your vote status.` : 
                                    `END Ikosa ryo kugenzura niba waratoye.`;
                                res.send(response);
                                return;
                            }

                            if (results[0].vote_count > 0) {
                                response = userLanguages[phoneNumber] === 'en' ? 
                                    `END You have already voted. Thank you!` : 
                                    `END Waratoye. Murakoze!`;
                                res.send(response);
                            } else {
                                // Retrieve candidates from database
                                getCandidates(candidates => {
                                    response = userLanguages[phoneNumber] === 'en' ? 
                                        `CON Select a candidate:\n` : 
                                        `CON Hitamo umukandida:\n`;

                                    candidates.forEach((candidate, index) => {
                                        response += `${index + 1}. ${candidate.name}\n`;
                                    });

                                    // Save candidates in the session for later use
                                    userLanguages[phoneNumber + '_candidates'] = candidates;

                                    res.send(response);
                                });
                                return; // Return to wait for async callback
                            }
                        });
                    }
                } else if (userInput[2] === '2') {
                    // View information option selected
                    getUserInfo(phoneNumber, userInfo => {
                        const userName = userNames[phoneNumber];
                        const userLanguage = userLanguages[phoneNumber];
                                                const votedCandidateID = userInfo ? userInfo.voted_candidate_id : null;

                        if (votedCandidateID !== null) {
                            // Fetch candidate name from the database based on the ID
                            const candidateQuery = 'SELECT name FROM candidates WHERE id = ?';
                            db.query(candidateQuery, [votedCandidateID], (err, result) => {
                                if (err) {
                                    console.error('Error retrieving candidate name:', err.stack);
                                    response = userLanguage === 'en' ?
                                        `END Error retrieving candidate information.` :
                                        `END Ikibazo ryo kubona amazina ya kandida.`;
                                    res.send(response);
                                } else {
                                    const votedCandidateName = result.length > 0 ? result[0].name : 'Unknown';
                                    response = userLanguage === 'en' ?
                                        `END Your Information:\nPhone: ${phoneNumber}\nName: ${userName}\nVoted Candidate: ${votedCandidateName}` :
                                        `END Amakuru yawe:\nTelefone: ${phoneNumber}\nIzina: ${userName}\nUmukandida watoye: ${votedCandidateName}`;
                                    res.send(response);
                                }
                            });
                        } else {
                            response = userLanguage === 'en' ?
                                `END Your Information:\nPhone: ${phoneNumber}\nName: ${userName}\nYou haven't voted yet.` :
                                `END Amakuru yawe:\nTelefone: ${phoneNumber}\nIzina: ${userName}\nNtabwo watoroye inyuma.`;
                            res.send(response);
                        }
                    });
                }
            });
        } else if (userInput[2] === '3' && userInput.length === 4) {
            const candidateIndex = parseInt(userInput[3]) - 1;
            const candidates = userLanguages[phoneNumber + '_candidates'];

            if (candidates && !isNaN(candidateIndex) && candidateIndex >= 0 && candidateIndex < candidates.length) {
                // User selected a valid candidate
                const selectedCandidate = candidates[candidateIndex];

                // Save vote in the database
                const voteQuery = 'INSERT INTO votes (phone_number, user_name, voted_candidate_id, candidate_id) VALUES (?, ?, ?, ?)';
                db.query(voteQuery, [phoneNumber, userNames[phoneNumber], selectedCandidate.id, selectedCandidate.candidate_id], err => {
                    if (err) {
                        console.error('Error saving vote to database:', err.stack);
                        response = userLanguages[phoneNumber] === 'en' ?
                            `END Error saving your vote. Please try again later.` :
                            `END Ikibazo ryo kugira ibyo watoroye kibaye. Ongera ugerageze kandi ntangira.`;
                    } else {
                        response = userLanguages[phoneNumber] === 'en' ?
                            `END Thank you for voting!` :
                            `END Murakoze kugira ibyo watoroye!`;
                    }
                    res.send(response);
                });
            } else {
                // Invalid candidate selection
                response = userLanguages[phoneNumber] === 'en' ?
                    `END Invalid candidate selection. Please try again.` :
                    `END Ikibazo ryo gutanga umukandida birangiye. Ongera ugerageze kandi ntangira.`;
                res.send(response);
            }
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

