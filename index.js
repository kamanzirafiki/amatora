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
    console.log('Received USSD request:', req.body);
    let response = '';

    // Extract USSD input
    const { sessionId, serviceCode, phoneNumber, text } = req.body;
    console.log('USSD Input:', text);

    // Parse user input
    const userInput = text.split('*').map(option => option.trim());
    console.log('User Input:', userInput);

    // Determine next action based on user input
    if (userInput.length === 1 && userInput[0] === '') {
        // First level menu: Language selection
        console.log('First Level Menu');
        response = `CON Welcome to E-TORA portal\n`;
        response += `1. English\n`;
        response += `2. Kinyarwanda`;
        res.send(response);
    } else if (userInput.length === 1 && userInput[0] !== '') {
        // Validate language selection
        console.log('Language Selection:', userInput[0]);
        if (userInput[0] === '1' || userInput[0] === '2') {
            // Save user's language choice and check if the user is an admin
            console.log('Language Selected:', userInput[0]);
            userLanguages[phoneNumber] = userInput[0] === '1' ? 'en' : 'rw';

            isAdmin(phoneNumber, (isAdmin, adminName) => {
                console.log('isAdmin Callback:', isAdmin, adminName);
                if (isAdmin) {
                    // Admin menu
                    response = userLanguages[phoneNumber] === 'en' ? 
                        `CON Hello ${adminName}, choose an option:\n1. View Votes\n2. My Information` : 
                        `CON Muraho ${adminName}, Hitamo:\n1. Reba amajwi\n2. Umwirondoro wanjye`;
                    console.log('Admin Menu:', response);
                } else {
                    // Prompt user to enter their name
                    response = userLanguages[phoneNumber] === 'en' ? 
                        `CON Enter your name:` : 
                        `CON Uzuza umwirondoro: \n Amazina yawe:`;
                    console.log('Prompt Name:', response);
                }
                res.send(response);
            });
        } else {
            // Invalid language selection
            console.log('Invalid Language Selection:', userInput[0]);
            response = `END Invalid selection. Please try again.` + 
                       `\nIbyo muhisemo Ntago aribyo. Ongera ugerageze.`;
            res.send(response);
        }
    } 
});


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
