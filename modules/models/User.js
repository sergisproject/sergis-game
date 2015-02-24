/*
    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
*/

// node modules
var crypto = require("crypto");

// our modules
var config = require("../../config"),
    contentComponentTypes = require("../contentComponentTypes");


// The salt length for pbkdf2 hashing of passwords
var HASH_SALT_LENGTH = 16;
// The number of iterations for pbkdf2 hashing of passwords
var HASH_NUM_ITERATIONS = 10000;
// The derived key length for pbkdf2 hashing of passwords
var HASH_DERIVED_KEY_LENGTH = 30;


/**
 * Encrypt a password.
 *
 * @param {string} password - The user-provided password to encrypt.
 *
 * @return {Promise.<string>} The encrypted password.
 */
function encryptPassword(password) {
    return new Promise(function (resolve, reject) {
        var randomSalt = crypto.randomBytes(HASH_SALT_LENGTH).toString("base64").substring(0, HASH_SALT_LENGTH),
            numIterations = HASH_NUM_ITERATIONS,
            derivedKeyLength = HASH_DERIVED_KEY_LENGTH;
        
        // Hash the password
        crypto.pbkdf2(password, randomSalt, numIterations, derivedKeyLength, function (err, derivedKey) {
            if (err) {
                reject(err);
                return;
            }
            
            var data = JSON.stringify([randomSalt, numIterations, derivedKeyLength, (new Buffer(derivedKey, "binary")).toString("base64")]);
            resolve(data.slice(1, -1));
        });
    });
}

/**
 * Check an encrypted password.
 *
 * @param {string} password - The user-provided password to check.
 * @param {string} encryptedPassword - The stored encrypted password to check
 *        against.
 *
 * @return {Promise.<boolean>} Whether the passwords match.
 */
function checkPassword(password, encryptedPassword) {
    return new Promise(function (resolve, reject) {
        var data;
        try {
            data = JSON.parse("[" + encryptedPassword + "]");
        } catch (err) {
            reject(err);
            return;
        }
        
        if (data && Array.isArray(data) && data.length == 4 &&
            typeof data[0] == "string" && // random salt
            typeof data[1] == "number" && // number of iterations
            typeof data[2] == "number" && // derived key length
            typeof data[3] == "string") { // derived key
            
            var randomSalt = data[0],
                numIterations = data[1],
                derivedKeyLength = data[2],
                derivedKey = data[3];
            
            // Hash the provided password
            crypto.pbkdf2(password, randomSalt, numIterations, derivedKeyLength, function (err, newDerivedKey) {
                if (err) {
                    reject(err);
                    return;
                }
                
                if ((new Buffer(newDerivedKey, "binary")).toString("base64") === derivedKey) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
        } else {
            reject(new Error("Invalid encrypted password."));
        }
    });
}


module.exports = function (mongoose) {
    var Schema = mongoose.Schema;
    
    // User schema
    var userSchema = new Schema({
        // The username of the user
        username: {
            type: String,
            unique: true,
            required: true
        },

        // The full name of the user
        name: String,

        // The salted and hashed password of the user
        encryptedPassword: String,

        // The games that the user is allowed to play
        allowedGames: [{
            type: Schema.Types.ObjectId,
            ref: "Game"
        }],

        // Data about the games that the user has played
        playedGames: [{
            // The game
            game: {
                type: Schema.Types.ObjectId,
                ref: "Game"
            },

            // Any user variables stored with this user and game combination
            userVars: Schema.Types.Mixed
        }],

        // Any auth tokens created for the authentication of the user
        authTokens: [{
            type: Schema.Types.ObjectId,
            ref: "AuthToken"
        }]
    });
    
    userSchema.methods.checkPassword = function (password) {
        return checkPassword(password, this.encryptedPassword);
    };
    
    userSchema.methods.setPassword = function (password) {
        return new Promise(function (resolve, reject) {
            encryptPassword(password).then(function (encryptedPassword) {
                this.encryptedPassword = encryptedPassword;
                resolve();
            }, reject);
        });
    };
    
    return mongoose.model("User", userSchema);
};
