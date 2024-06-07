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

// Check if the phone number belongs to an admin
function isAdmin(phoneNumber, callback) {
    const query = 'SELECT * FROM admin WHERE phone_number = ?';
    db.query(query, [phoneNumber], (err, results) => {
        if (err) {
            console.error('Error checking admin status:', err.stack);
            callback(false, null);
        } else {
            callback(results.length > 0, results.length > 0 ? results[0].name : null);
        }
    });
}

app.post('/ussd', (req, res) => {
    let response = '';

    // Extract USSD input
    const { sessionId, serviceCode, phoneNumber, text } = req.body;

    // Parse user input
    const userInput = text.split('*').map(option => option.trim());

    if (userInput.length === 1 && userInput[0] === '') {
        // First level menu: Check if user is admin
        isAdmin(phoneNumber, (isAdmin, adminName) => {
            if (isAdmin) {
                // Directly show admin menu
                response = `CON Hello ${adminName}, choose an option:\n1. View Votes\n2. View Information`;
                res.send(response);
            } else {
                // First level menu: Language selection for regular users
                response = `CON Welcome to E-voting portal\n`;
                response += `1. English\n`;
                response += `2. Kinyarwanda`;
                res.send(response);
            }
        });
    } else if (userInput.length === 1 && userInput[0] !== '') {
        // Validate language selection
        if (userInput[0] === '1' || userInput[0] === '2') {
            // Save user's language choice and move to the name input menu
            userLanguages[phoneNumber] = userInput[0] === '1' ? 'en' : 'rw';
            if (userInput[0] === '2') {
                // Skip name input for admin viewing votes
                response = `CON Fetching votes...\n`;
                const query = 'SELECT voted_candidate, COUNT(*) as vote_count FROM votes GROUP BY voted_candidate';
                db.query(query, (err, results) => {
                    if (err) {
                        console.error('Error retrieving votes from database:', err.stack);
                        response += `END Error retrieving votes.`;
                    } else {
                        response += `END Votes:\n`;
                        results.forEach(row => {
                            response += `${row.voted_candidate}: ${row.vote_count} votes\n`;
                        });
                    }
                    res.send(response);
                });
            } else {
                // Prompt for name input for regular users
                response = userLanguages[phoneNumber] === 'en' ? 
                    `CON Please enter your name:` : 
                    `CON Uzuza uwmirondoro: \n Amazina yawe:`;
                res.send(response);
            }
        } else {
            // Invalid language selection
            response = `END Invalid selection. Please try again.` + 
                       `\nIbyo muhisemo Ntago aribyo. Ongera ugerageze.`;
            res.send(response);
        }
    } else if (userInput.length === 2) {
        // Save user's name
        userNames[phoneNumber] = userInput[1];

        // Check if the user is an admin
        isAdmin(phoneNumber, (isAdmin, adminName) => {
            if (isAdmin) {
                // Admin menu
                response = `CON Hello ${adminName}, choose an option:\n1. View Votes\n2. View Information`;
            } else {
                // Regular user menu
                response = userLanguages[phoneNumber] === 'en' ? 
                    `CON Hello ${userNames[phoneNumber]}, choose an option:\n1. Vote Candidate\n2. View Information` : 
                    `CON Muraho ${userNames[phoneNumber]}, Hitamo:\n1. Tora umukandida\n2. Reba amakuru`;
            }
            res.send(response);
        });
    } else if (userInput.length === 3) {
        if (userInput[2] === '1' || userInput[2] === '2') {
            isAdmin(phoneNumber, (isAdmin) => {
                if (isAdmin) {
                    if (userInput[2] === '2') {
                        // Admin viewing own information
                        const query = 'SELECT * FROM admin WHERE phone_number = ?';
                        db.query(query, [phoneNumber], (err, results) => {
                            if (err) {
                                console.error('Error retrieving admin information from database:', err.stack);
                                response = `END Error retrieving admin information.`;
                            } else {
                                const adminInfo = results[0];
                                response = `END Admin Information:\nName: ${adminInfo.name}\nPhone Number: ${adminInfo.phone_number}`;
                            }
                            res.send(response);
                        });
                    }
                } else {
                    // Regular user voting
                    // Code for regular user voting
                }
            });
        } else {
            // Invalid main menu selection
            response = userLanguages[phoneNumber] === 'en' ? 
                `END Invalid selection. Please try again.` : 
                `END Ibyo muhisemo Ntago aribyo. Ongera ugerageze.`;
            res.send(response);
        }
    } else if (userInput.length === 4) {
        // Fourth level menu: Voting confirmation
        // Code for voting confirmation
    } else {
        // Catch-all for any other invalid input
        response = userLanguages[phoneNumber] === 'en' ? 
            `END Invalid selection. Please try again.` : 
            `END Ibyo muhisemo Ntago aribyo. Ongera ugerageze`;
        res.send(response);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
