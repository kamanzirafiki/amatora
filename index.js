const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

// Database connection details
const dbConfig = {
    host: 'btw2bu9p01s29x8hplgj-mysql.services.clever-cloud.com',
    user: 'u7oaqmno7he8keou',
    password: 'RpLD6MtQImUD6trHT8hL', // Replace with your MySQL password
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

// In-memory storage for user data (for simplicity)
let userNames = {};
let voters = new Set(); // Set to track phone numbers that have already voted
let userLanguages = {}; // Object to store the language preference of each user

// Retrieve candidates from database
function getCandidates(callback) {
    const query = 'SELECT name FROM candidates';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error retrieving candidates from database:', err.stack);
            callback([]);
        } else {
            const candidateNames = results.map(candidate => candidate.name);
            callback(candidateNames);
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

app.post('/ussd', (req, res) => {
    let response = '';

    // Extract USSD input
    const { sessionId, serviceCode, phoneNumber, text } = req.body;

    // Parse user input
    const userInput = text.split('*').map(option => option.trim());

    // Determine next action based on user input
    if (userInput.length === 1 && userInput[0] === '') {
        // First level menu: Language selection
        response = `CON Welcome to E-voting portal\n`;
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
                        `CON Hello  ${adminName}, choose an option:\n1. View Votes\n2. View Information` : 
                        `CON Muraho  ${adminName}, Hitamo:\n1. Reba amajwi\n2. Reba amakuru`;
                } else {
                    // Prompt user to enter their name
                    response = userLanguages[phoneNumber] === 'en' ? 
                        `CON Please enter your name:` : 
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
                // Admin menu
                response = userLanguages[phoneNumber] === 'en' ? 
                    `CON Hello  ${adminName}, choose an option:\n1. View Votes\n2. View Information` : 
                    `CON Muraho  ${adminName}, Hitamo:\n1. Reba amajwi\n2. Reba amakuru`;
            } else {
                // Regular user menu
                response = userLanguages[phoneNumber] === 'en' ? 
                    `CON Hello ${userNames[phoneNumber]}, choose an option:\n1. Vote Candidate\n2. View Information` : 
                    `CON Muraho ${userNames[phoneNumber]}, Hitamo:\n1. Tora umukandida\n2. Reba amakuru`;
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
                        response = `END Votes:\n`;
                        // Query to get votes from the database
                        const query = 'SELECT voted_candidate, COUNT(*) as vote_count FROM votes GROUP BY voted_candidate';
                        db.query(query, (err, results) => {
                            if (err) {
                                console.error('Error retrieving votes from database:', err.stack);
                                response += `Error retrieving votes.`;
                            } else {
                                results.forEach(row => {
                                    response += `${row.voted_candidate}: ${row.vote_count} votes\n`;
                                });
                            }
                            res.send(response);
                        });
                        return;
                    } else {
                        // Check if the phone number has already voted
                        if (voters.has(phoneNumber)) {
                            response = userLanguages[phoneNumber] === 'en' ? 
                                `END You have already voted. Thank you!` : 
                                `END Waratoye. Murakoze!`;
                        } else {
                            // Retrieve candidates from database
                            getCandidates(candidateNames => {
                                response = userLanguages[phoneNumber] === 'en' ? 
                                    `CON Select a candidate:\n` : 
                                    `CON Hitamo umukandida:\n`;

                                candidateNames.forEach((candidate, index) => {
                                    response += `${index + 1}. ${candidate}\n`;
                                });

                                res.send(response);
                            });
                            return; // Return to wait for async callback
                        }
                    }
                } else if (userInput[2] === '2') {
                    // View information option selected
                    const query = 'SELECT name, phone_number FROM admin WHERE phone_number = ?';
                    console.log("Admin's phone number:", phoneNumber);
                    db.query(query, [phoneNumber], (err, results) => {
                        if (err) {
                            console.error('Error retrieving admin information from database:', err.stack);
                            response = userLanguages[phoneNumber] === 'en' ? 
                                `END Error retrieving admin information.` : 
                                `END Amakuru ntago abonetse.`;
                            res.send(response);
                        } else if (results.length > 0) {
                            console.log("Admin records:", results);
                            const { name, phone_number } = results[0];
                            response = userLanguages[phoneNumber] === 'en' ? 
                                `END Your Information:\nName: ${name}\nPhone: ${phone_number}` : 
                                `END Umwirondoro:\nIzina: ${name}\nTelefone: ${phone_number}`;
                            res.send(response);
                        } else {
                            console.log("No admin records found.");
                            response = userLanguages[phoneNumber] === 'en' ? 
                                `END  information not found.` : 
                                `END Amakuru ntago abonetse.`;
                            res.send(response);
                        }
                    });
                    return; // Return to wait for async callback
                }
            });
            return; // Return to wait for async callback
        } else {
            // Invalid main menu selection
            response = userLanguages[phoneNumber] === 'en' ? 
                `END Invalid selection. Please try again.` : 
                `END Ibyo muhisemo Ntago aribyo. Ongera ugerageze.`;
        }
    } else if (userInput.length === 4) {
        // Fourth level menu: Voting confirmation
        let candidateIndex = parseInt(userInput[3]) - 1;

        getCandidates(candidateNames => {
            if (
                if (candidateIndex >= 0 && candidateIndex < candidateNames.length) {
                const selectedCandidate = candidateNames[candidateIndex];
                voters.add(phoneNumber); // Mark this phone number as having voted
                response = userLanguages[phoneNumber] === 'en' ? 
                    `END Thank you for voting ${selectedCandidate}!` : 
                    `END Murakoze gutora, Mutoye ${selectedCandidate}!`;

                // Insert voting record into the database
                const timestamp = new Date();
                const voteData = {
                    session_id: sessionId,
                    phone_number: phoneNumber,
                    user_name: userNames[phoneNumber],
                    language_used: userLanguages[phoneNumber],
                    voted_candidate: selectedCandidate,
                    voted_time: timestamp
                };

                const query = 'INSERT INTO votes SET ?';
                db.query(query, voteData, (err, result) => {
                    if (err) {
                        console.error('Error inserting data into database:', err.stack);
                    }
                });

                res.send(response);
            } else {
                response = userLanguages[phoneNumber] === 'en' ? 
                    `END Invalid selection. Please try again.` : 
                    `END Ibyo muhisemo Ntago aribyo. Ongera ugerageze.`;
                res.send(response);
            }
        });
        return; // Return to wait for async callback
    } else {
        // Catch-all for any other invalid input
        response = userLanguages[phoneNumber] === 'en' ? 
            `END Invalid selection. Please try again.` : 
            `END Ibyo muhisemo Ntago aribyo. Ongera ugerageze.`;
    }

    res.send(response);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
