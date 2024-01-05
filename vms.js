const express = require('express');
const session = require('express-session');
const app = express();
const port = process.env.PORT || 3000;

// connect to mongodb
const {
    MongoClient
} = require('mongodb'); // import the mongodb client
//const url = process.env.MONGODB_URI; // the url to the database
const url = "mongodb+srv://khanfairuz764:011018@faruserver.1b8musi.mongodb.net/";
const client = new MongoClient(url); // create a new mongodb client

const MongoStore = require('connect-mongo');


// session middleware
app.use(session({
    //secret: process.env.SESSION_SECRET,// a random string used for encryption
    secret: 'supercalifragilisticexpialidocious', // a random string used for encryption
    resave: false, // don't save session if unmodified
    saveUninitialized: false, // don't create session until something stored
    //cookie: { domain: 'https://farubonvms.azurewebsites.net/' } // cookie settings
}));

// json middleware
app.use(express.json());

// qr code middleware
var QRCode = require('qrcode')

// swagger middleware
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Welcome to FaruBon VMS API',
            version: '1.0.0',
        },
    },
    apis: ['./vms.js'],
};

// swagger docs
const specs = swaggerJsdoc(options);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

/**
 * @swagger
 * tags:
 *   - name: Test
 *     description: Create a test resident account without admin/security previlege
 *   - name: Visitor
 *     description: Visitor can apply for visit and check applicaton status, no login required
 *   - name: Resident
 *     description: Resident can create, approve and reject visitor invites, view their visitors, login required
 *   - name: Security
 *     description: Security can check in and check out visitors, view all visitors, login required 
 *   - name: Admin
 *     description: Admin can create and remove resident and security, view all visitors, login required
 */



// bcrypt middleware
const bcrypt = require('bcryptjs') // to hash the password
const saltRounds = 13 // the higher the number the more secure, but slower

async function run() {
    try {
        // Connect the client to the server
        await client.connect();

        // Send a ping to confirm a successful connection
        await client.db("admin").command({
            ping: 1
        });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

        app.get('/', (req, res) => {
            res.redirect('/api-docs');
        });

        /**
         * @swagger
         * /login:
         *   post:
         *     tags: 
         *      - Admin
         *      - Security
         *      - Resident
         *     description: Login to the system
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               username:
         *                 type: string
         *               password:
         *                 type: string
         *     responses:
         *       200:
         *         description: Reply from the server
         */

        app.post('/login', async (req, res) => {
            let data = req.body;
            // check if user exists
            const result = await client.db("Assignment").collection("Users").findOne({
                _id: data.username

            });

            // if user exists, check if password is correct
            if (result) {
                if (await bcrypt.compare(data.password, result.password)) {
                    // if password is correct, create a session
                    req.session.user = {
                        name: result.name,
                        username: result._id,
                        role: result.role,
                        apartment: result.apartment
                    }
                    console.log(req.session);
                    if (req.session.user.role == "admin") {
                        try {
                            result1 = await client.db("Assignment").collection("Visitors").aggregate([{
                                    $sort: {
                                        _id: -1
                                    }
                                },
                                {
                                    $project: {
                                        _id: 1,
                                        host: 1,
                                        apartment: 1,
                                        name: 1,
                                        carplate: 1,
                                        identification: 1,
                                        mobile: 1,
                                        visitpurpose: 1,
                                        status: 1,
                                        reason: 1,
                                        checkin: 1,
                                        checkout: 1
                                    }
                                }
                            ]).toArray();

                            res.send({
                                to: req.session.user.name,
                                message: 'Hello ' + req.session.user.name + ', you are now logged in as ' + req.session.user.role + '. Here are the list of all visitors: ',
                                visitors: result1
                            });
                        } catch (e) {
                            res.send("Error retrieving visitors");
                        }

                    } else {
                        res.send("Hello " + result.name + ", you are now logged in as " + result.role);
                    }
                } else {
                    res.send("Wrong Password");
                }
            } else {
                res.send("Username not found");
            }
        });

        /**
         * @swagger
         * /register/resident:
         *   post:
         *     tags:
         *       - Admin
         *     description: Register a new resident
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               _id:
         *                 type: string
         *               password:
         *                 type: string
         *               name:
         *                 type: string
         *               apartment:
         *                 type: string
         *               mobile:
         *                 type: string
         *     responses:
         *       200:
         *         description: Reply from the server
         */
        app.post('/register/resident', async (req, res) => {
            if (req.session.user)
                if (req.session.user.role == "admin") {
                    data = req.body;
                    try {
                        //check if user already exists
                        result = await client.db("Assignment").collection("Users").findOne({
                            _id: data._id,
                            role: "resident"
                        });

                        if (result) {
                            res.send("User already exists");
                        } else {
                            //hash password
                            const hashedPassword = await bcrypt.hash(data.password, saltRounds);

                            //insert user
                            const result = await client.db("Assignment").collection("Users").insertOne({
                                _id: data._id,
                                password: hashedPassword,
                                role: "resident",
                                name: data.name,
                                apartment: data.apartment,
                                mobile: data.mobile,
                                pendingvisitors: [],
                                incomingvisitors: [],
                                pastvisitors: [],
                                blockedvisitors: []
                            });

                            res.send('New resident created with the following id: ' + result.insertedId);
                        }
                    } catch (e) {
                        res.send("Error creating new resident");
                    }
                } else {
                    res.send("You do not have the previlege to create a new resident");
                }
            else {
                res.send("You are not logged in");
            }
        });

        /**
         * @swagger
         * /register/testresident:
         *   post:
         *     tags:
         *       - Test
         *     description: Register a new test resident, without admin previlege
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               _id:
         *                 type: string
         *               password:
         *                 type: string
         *               name:
         *                 type: string
         *               apartment:
         *                 type: string
         *               mobile:
         *                 type: string
         *     responses:
         *       200:
         *         description: Reply from the server
         */
        app.post('/register/testresident', async (req, res) => {
            data = req.body;
            try {
                //check if user already exists
                result = await client.db("Assignment").collection("Users").findOne({
                    _id: data._id,
                    role: "resident"
                });

                if (result) {
                    res.send("User already exists");
                } else {
                    //hash password
                    const hashedPassword = await bcrypt.hash(data.password, saltRounds);

                    //insert user
                    const result = await client.db("Assignment").collection("Users").insertOne({
                        _id: data._id,
                        password: hashedPassword,
                        role: "resident",
                        name: data.name,
                        apartment: data.apartment,
                        mobile: data.mobile,
                        pendingvisitors: [],
                        incomingvisitors: [],
                        pastvisitors: [],
                        blockedvisitors: []
                    });

                    res.send('New resident created with the following id: ' + result.insertedId);
                }
            } catch (e) {
                res.send("Error creating new resident");
            }
        });

        /**
         * @swagger
         * /remove/resident:
         *   post:
         *     tags:
         *       - Admin
         *     description: Remove a resident
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               _id:
         *                 type: string
         *     responses:
         *       200:
         *         description: Reply from the server
         */
        app.post('/remove/resident', async (req, res) => {
            if (req.session.user)
                if (req.session.user.role == "admin") {
                    data = req.body;
                    try {
                        //check if user already exists
                        result = await client.db("Assignment").collection("Users").findOne({
                            _id: data._id,
                            role: "resident"
                        });

                        if (result) {
                            //remove user
                            const result = await client.db("Assignment").collection("Users").deleteOne({
                                _id: data._id,
                                role: "resident"
                            });

                            res.send('Resident with the following id: ' + data._id + " has been removed");
                        } else {
                            res.send("User does not exist");
                        }
                    } catch (e) {
                        res.send("Error removing resident");
                    }
                } else {
                    res.send("You do not have the previlege to remove a resident");
                }
            else {
                res.send("You are not logged in");
            }
        });

        /**
         * @swagger
         * /register/security:
         *   post:
         *     tags:
         *       - Admin
         *     description: Register a new security
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               _id:
         *                 type: string
         *               password:
         *                 type: string
         *               name:
         *                 type: string
         *               mobile:
         *                 type: string
         *     responses:
         *       200:
         *         description: Reply from the server
         */
        app.post('/register/security', async (req, res) => {
            if (req.session.user)
                if (req.session.user.role == "admin") {
                    data = req.body;
                    try {
                        //check if user already exists
                        result = await client.db("Assignment").collection("Users").findOne({
                            _id: data._id,
                            role: "security"
                        });

                        if (result) {
                            res.send("User already exists");
                        } else {
                            //hash password
                            const hashedPassword = await bcrypt.hash(data.password, saltRounds);

                            //insert user
                            const result = await client.db("Assignment").collection("Users").insertOne({
                                _id: data._id,
                                password: hashedPassword,
                                role: "security",
                                name: data.name,
                                mobile: data.mobile
                            });

                            res.send('New security created with the following id: ' + result.insertedId);
                        }
                    } catch (e) {
                        res.send("Error creating new security");
                    }
                } else {
                    res.send("You do not have the previlege to create a new security");
                }
            else {
                res.send("You are not logged in");
            }
        });


        /**
         * @swagger
         * /remove/security:
         *   post:
         *     tags:
         *       - Admin
         *     description: Remove a security
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               _id:
         *                 type: string
         *     responses:
         *       200:
         *         description: Reply from the server
         */
        app.post('/remove/security', async (req, res) => {
            if (req.session.user)
                if (req.session.user.role == "admin") {
                    data = req.body;
                    try {
                        //check if user already exists
                        result = await client.db("Assignment").collection("Users").findOne({
                            _id: data._id,
                            role: "security"
                        });

                        if (result) {
                            //remove user
                            const result = await client.db("Assignment").collection("Users").deleteOne({
                                _id: data._id,
                                role: "security"
                            });

                            res.send('Security with the following id: ' + data._id + " has been removed");
                        } else {
                            res.send("User does not exist");
                        }
                    } catch (e) {
                        res.send("Error removing security");
                    }
                } else {
                    res.send("You do not have the previlege to remove a security");
                }
            else {
                res.send("You are not logged in");
            }
        });

        /**
         * @swagger
         * /visitor/new:
         *   post:
         *     tags:
         *       - Visitor
         *     description: Create a new visitor request
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               apartment:
         *                 type: string
         *               name:
         *                 type: string
         *               carplate:
         *                 type: string
         *               identification:
         *                 type: string
         *               mobile:
         *                 type: string
         *               visitpurpose:
         *                 type: string
         *     responses:
         *       200:
         *         description: Reply from the server
         */
        app.post('/visitor/new', async (req, res) => {
            req.body._id = visitoridgenerator();
            req.body.status = "pending";
            data = req.body;
            try {
                // add visitor to host's pending visitors
                await client.db("Assignment").collection("Users").updateOne({
                    apartment: data.apartment
                }, {
                    $push: {
                        pendingvisitors: req.body._id
                    }
                });

                // insert visitor into database
                // add the host id into data
                hostid = await client.db("Assignment").collection("Users").findOne({
                    apartment: data.apartment
                });
                data.host = hostid._id;
                //const result = await client.db("Assignment").collection("Visitors").insertOne(data);

                const result = await client.db("Assignment").collection("Visitors").insertOne({
                    _id: data._id,
                    host: data.host,
                    apartment: data.apartment,
                    name: data.name,
                    carplate: data.carplate,
                    identification: data.identification,
                    mobile: data.mobile,
                    visitpurpose: data.visitpurpose,
                    status: data.status
                });

                // generate QR code
                QRCode.toDataURL(data._id, async (err, url) => {
                    if (err) {
                        res.send('Error generating QR code');
                    } else {
                        await client.db("Assignment").collection("Visitors").updateOne({
                            _id: data._id
                        }, {
                            $set: {
                                qrcode: url
                            }
                        });

                        res.send({
                            "message": "Your visitor request has been submitted, Please wait for approval from your host.",
                            "qrcode": url,
                            "visitorid": data._id,
                            "apartment": data.apartment,
                            "name": data.name,
                            "carplate": data.carplate,
                            "identification": data.identification,
                            "mobile": data.mobile,
                            "visitpurpose": data.visitpurpose,
                        });
                    }
                });

                // // generate QR code
                // QRCode.toString(data._id, {
                //     type: "utf8"
                // }, (err, string) => {
                //     if (err) {
                //         res.send('Error generating QR code');
                //     } else {
                //         // Send the QR code as a response
                //         // Add spacing between each line
                //         const lines = string.split('\n');
                //         const spacedString = lines.join('                                   ');
                //         res.send({
                //             "message": "Your visitor request has been submitted with the following id: " + result.insertedId + ". Please wait for approval from your host.",
                //             // "qrcode": string,
                //             "qrcode": spacedString,
                //             "visitorid": data._id,
                //             "host": data.host,
                //             "apartment": data.apartment,
                //             "name": data.name,
                //             "carplate": data.carplate,
                //             "identification": data.identification,
                //             "mobile": data.mobile,
                //             "visitpurpose": data.visitpurpose,
                //         });
                //     }
                // });
            } catch (e) {
                res.send("Error creating new listing,either host or apartment not found");
            }
        });

        /**
         * @swagger
         * /visitor/status:
         *   post:
         *     tags:
         *       - Visitor
         *     description: Check visitor status
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               _id:
         *                 type: string
         *     responses:
         *       200:
         *         description: Reply from the server
         */
        app.post('/visitor/status', async (req, res) => {
            data = req.body;
            result = await client.db("Assignment").collection("Visitors").findOne({
                _id: data._id
            });

            try {
                result1 = await client.db("Assignment").collection("Visitors").aggregate([{
                        $match: {
                            _id: data._id
                        }
                    },
                    {
                        $project: {
                            _id: 1,
                            apartment: 1,
                            name: 1,
                            carplate: 1,
                            identification: 1,
                            mobile: 1,
                            visitpurpose: 1,
                            status: 1,
                            qrcode: 1,
                        }
                    }
                ]).toArray();
            } catch (e) {
                res.send("Error retrieving visitor status");
            }

            if (result) {
                if (result.status == "pending") {
                    res.send({
                        to: result1[0].name,
                        message: "Your visitor request is still pending approval from your host.",
                        details: result1
                    });
                } else if (result.status == "approved") {
                    res.send({
                        to: result1[0].name,
                        message: "Your visitor request has been approved. Please scan the QR code to check in.",
                        details: result1
                    });
                } else if (result.status == "rejected") {
                    res.send({
                        to: result1[0].name,
                        message: "Your visitor request has been rejected by your host. Please contact your host for more information.",
                        details: result1
                    });
                } else {
                    res.send("Invalid visitor status");
                }
            } else {
                res.send("Visitor not found");
            }
        });


        /**
         * @swagger
         * /dashboard:
         *   get:
         *     tags:
         *       - Security
         *       - Admin
         *       - Resident
         *     description: Retrieve all visitors
         *     responses:
         *       200:
         *         description: Reply from the server
         */
        app.get('/dashboard', async (req, res) => {
            if (req.session.user) {
                if (req.session.user.role == "security" || req.session.user.role == "admin") {
                    try {
                        result = await client.db("Assignment").collection("Visitors").aggregate([{
                                $sort: {
                                    _id: -1
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    host: 1,
                                    apartment: 1,
                                    name: 1,
                                    carplate: 1,
                                    identification: 1,
                                    mobile: 1,
                                    visitpurpose: 1,
                                    status: 1,
                                    reason: 1,
                                    checkin: 1,
                                    checkout: 1
                                }
                            }
                        ]).toArray();

                        res.send({
                            to: req.session.user.name,
                            message: 'Here are the list of all visitors: ',
                            visitors: result
                        });
                    } catch (e) {
                        res.send("Error retrieving visitors");
                    }
                } else if (req.session.user && req.session.user.role == "resident") {
                    try {
                        // list all pending visitors
                        result = await client.db("Assignment").collection("Visitors").aggregate([{
                                $match: {
                                    host: req.session.user.username,
                                }
                            },
                            {
                                $sort: {
                                    _id: -1
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    name: 1,
                                    carplate: 1,
                                    identification: 1,
                                    mobile: 1,
                                    visitpurpose: 1,
                                    status: 1,
                                    reason: 1,
                                    checkin: 1,
                                    checkout: 1
                                }
                            }
                        ]).toArray();

                        res.send({
                            to: req.session.user.name,
                            message: 'Here are the list of your visitors: ',
                            visitors: result
                        });
                    } catch (e) {
                        res.send("Error retrieving visitors");
                    }
                } else {
                    res.send("You do not have the previlege to view pending visitors");
                }
            } else {
                res.send("You are not logged in");
            }
        });

        /**
         * @swagger
         * /dashboard/pending:
         *   get:
         *     tags:
         *       - Security
         *       - Admin
         *       - Resident
         *     description: Retrieve all pending visitors
         *     responses:
         *       200:
         *         description: Reply from the server
         */
        app.get('/dashboard/pending', async (req, res) => {
            if (req.session.user) {
                if (req.session.user.role == "security" || req.session.user.role == "admin") {
                    try {
                        result = await client.db("Assignment").collection("Visitors").aggregate([{
                                $match: {
                                    status: "pending",
                                }
                            },
                            {
                                $sort: {
                                    _id: -1
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    host: 1,
                                    apartment: 1,
                                    name: 1,
                                    carplate: 1,
                                    identification: 1,
                                    mobile: 1,
                                    visitpurpose: 1,
                                }
                            }
                        ]).toArray();

                        res.send({
                            to: req.session.user.name,
                            message: "Here are the list of all pending visitors: ",
                            visitors: result
                        });
                    } catch (e) {
                        res.send("Error retrieving pending visitors");
                    }
                } else if (req.session.user && req.session.user.role == "resident") {
                    try {
                        // list all pending visitors
                        result = await client.db("Assignment").collection("Visitors").aggregate([{
                                $match: {
                                    host: req.session.user.username,
                                    status: "pending"
                                }
                            },
                            {
                                $sort: {
                                    _id: -1
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    name: 1,
                                    carplate: 1,
                                    identification: 1,
                                    mobile: 1,
                                    visitpurpose: 1,
                                }
                            }
                        ]).toArray();

                        res.send({
                            to: req.session.user.name,
                            message: "Here are the list of your pending visitors: ",
                            visitors: result
                        });
                    } catch (e) {
                        res.send("Error retrieving pending visitors");
                    }
                } else {
                    res.send("You do not have the previlege to view pending visitors");
                }
            } else {
                res.send("You are not logged in");
            }
        });

        /**
         * @swagger
         * /dashboard/approved:
         *   get:
         *     tags:
         *       - Security
         *       - Admin
         *       - Resident
         *     description: Retrieve all approved visitors
         *     responses:
         *       200:
         *         description: Reply from the server
         */
        app.get('/dashboard/approved', async (req, res) => {
            if (req.session.user) {
                if (req.session.user.role == "security" || req.session.user.role == "admin") {
                    try {
                        result = await client.db("Assignment").collection("Visitors").aggregate([{
                                $match: {
                                    status: "approved",
                                }
                            },
                            {
                                $sort: {
                                    _id: -1
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    host: 1,
                                    apartment: 1,
                                    name: 1,
                                    carplate: 1,
                                    identification: 1,
                                    mobile: 1,
                                    visitpurpose: 1,
                                }
                            }
                        ]).toArray();

                        res.send({
                            to: req.session.user.name,
                            message: "Here are the list of all approved visitors: ",
                            visitors: result
                        });
                    } catch (e) {
                        res.send("Error retrieving approved visitors");
                    }
                } else if (req.session.user && req.session.user.role == "resident") {
                    try {
                        result = await client.db("Assignment").collection("Visitors").aggregate([{
                                $match: {
                                    host: req.session.user.username,
                                    status: "approved"
                                }
                            },
                            {
                                $sort: {
                                    _id: -1
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    name: 1,
                                    carplate: 1,
                                    identification: 1,
                                    mobile: 1,
                                    visitpurpose: 1,
                                }
                            }
                        ]).toArray();

                        res.send({
                            to: req.session.user.name,
                            message: "Gere are the list of your approved visitors: ",
                            visitors: result
                        });
                    } catch (e) {
                        res.send("Error retrieving approved visitors");
                    }
                } else {
                    res.send("You do not have the previlege to view approved visitors");
                }
            } else {
                res.send("You are not logged in");
            }
        });

        /**
         * @swagger
         * /dashboard/rejected:
         *   get:
         *     tags:
         *       - Security
         *       - Admin
         *       - Resident
         *     description: Retrieve all rejected visitors
         *     responses:
         *       200:
         *         description: Reply from the server
         */
        app.get('/dashboard/rejected', async (req, res) => {
            if (req.session.user) {
                if (req.session.user.role == "security" || req.session.user.role == "admin") {
                    try {
                        result = await client.db("Assignment").collection("Visitors").aggregate([{
                                $match: {
                                    status: "rejected",
                                }
                            },
                            {
                                $sort: {
                                    _id: -1
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    host: 1,
                                    apartment: 1,
                                    name: 1,
                                    carplate: 1,
                                    identification: 1,
                                    mobile: 1,
                                    visitpurpose: 1,
                                    reason: 1
                                }
                            }
                        ]).toArray();

                        res.send({
                            to: req.session.user.name,
                            message: "Here are the list of all rejected visitors: ",
                            visitors: result
                        });
                    } catch (e) {
                        res.send("Error retrieving rejected visitors");
                    }
                } else if (req.session.user && req.session.user.role == "resident") {
                    try {
                        result = await client.db("Assignment").collection("Visitors").find({
                            host: req.session.user.username,
                            status: "rejected"
                        }).toArray();

                        result = await client.db("Assignment").collection("Visitors").aggregate([{
                                $match: {
                                    host: req.session.user.username,
                                    status: "rejected"
                                }
                            },
                            {
                                $sort: {
                                    _id: -1
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    name: 1,
                                    carplate: 1,
                                    identification: 1,
                                    mobile: 1,
                                    visitpurpose: 1,
                                    reason: 1
                                }
                            }
                        ]).toArray();

                        res.send({
                            to: req.session.user.name,
                            message: "Here are the list of your rejected visitors: ",
                            visitors: result
                        });
                    } catch (e) {
                        res.send("Error retrieving rejected visitors");
                    }
                } else {
                    res.send("You do not have the previlege to view rejected visitors");
                }
            } else {
                res.send("You are not logged in");
            }
        });

        /**
         * @swagger
         * /dashboard/history:
         *   get:
         *     tags:
         *       - Security
         *       - Admin
         *       - Resident
         *     description: Retrieve all pass visitors
         *     responses:
         *       200:
         *         description: Reply from the server
         */
        app.get('/dashboard/history', async (req, res) => {
            if (req.session.user) {
                if (req.session.user.role == "security" || req.session.user.role == "admin") {
                    try {
                        result = await client.db("Assignment").collection("Visitors").aggregate([{
                                $match: {
                                    status: "checkedout"
                                }
                            },
                            {
                                $sort: {
                                    _id: -1
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    host: 1,
                                    apartment: 1,
                                    name: 1,
                                    carplate: 1,
                                    identification: 1,
                                    mobile: 1,
                                    visitpurpose: 1,
                                    checkin: 1,
                                    checkout: 1
                                }
                            }
                        ]).toArray();

                        res.send({
                            to: req.session.user.name,
                            message: "Here are the list of all past visitors: ",
                            visitors: result

                        });
                    } catch (e) {
                        res.send("Error retrieving history");
                    }
                } else if (req.session.user.role == "resident") {
                    try {
                        result = await client.db("Assignment").collection("Visitors").aggregate([{
                                $match: {
                                    host: req.session.user.username,
                                    status: "checkedout"
                                }
                            },
                            {
                                $sort: {
                                    _id: -1
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    name: 1,
                                    carplate: 1,
                                    identification: 1,
                                    mobile: 1,
                                    visitpurpose: 1,
                                    checkin: 1,
                                    checkout: 1
                                }
                            }
                        ]).toArray();

                        res.send({
                            to: req.session.user.name,
                            message: "Here are the list of your past visitors: ",
                            visitors: result
                        });
                    } catch (e) {
                        res.send("Error retrieving history");
                    }
                } else {
                    res.send("You do not have the previlege to view history");
                }
            } else {
                res.send("You are not logged in");
            }
        });


        /**
         * @swagger
         * /dashboard/create:
         *  post:
         *     tags:
         *       - Resident
         *     description: Create a new visitor invite
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               name:
         *                 type: string
         *               carplate:
         *                 type: string
         *               identification:
         *                 type: string
         *               mobile:
         *                 type: string
         *               visitpurpose:
         *                 type: string
         *     responses:
         *       200:
         *         description: Visitor invite created
         *       400:
         *         description: Error creating a new visitor invite
         *       401:
         *         description: You do not have the privilege to create a new visitor invite
         *       402:
         *         description: You are not logged in
         */
        app.post('/dashboard/create', async (req, res) => {
            if (req.session.user) {
                if (req.session.user.role == "resident") {
                    req.body._id = visitoridgenerator();
                    req.body.status = "approved";
                    req.body.host = req.session.user.username;
                    req.body.apartment = req.session.user.apartment;
                    data = req.body;
                    try {
                        await client.db("Assignment").collection("Users").updateOne({
                            _id: data.host,
                            apartment: data.apartment
                        }, {
                            $push: {
                                incomingvisitors: req.body._id
                            }
                        });

                        const result = await client.db("Assignment").collection("Visitors").insertOne({
                            _id: data._id,
                            host: data.host,
                            apartment: data.apartment,
                            name: data.name,
                            carplate: data.carplate,
                            identification: data.identification,
                            mobile: data.mobile,
                            visitpurpose: data.visitpurpose,
                            status: data.status
                        });

                        QRCode.toDataURL(data._id, async (err, url) => {
                            if (err) {
                                res.send('Error generating QR code');
                            } else {
                                await client.db("Assignment").collection("Visitors").updateOne({
                                    _id: data._id
                                }, {
                                    $set: {
                                        qrcode: url
                                    }
                                });

                                res.send({
                                    "message": "You have created a new visitor invite, Please send the QR code to your visitor.",
                                    "qrcode": url,
                                    "visitorid": data._id,
                                    "apartment": data.apartment,
                                    "name": data.name,
                                    "carplate": data.carplate,
                                    "identification": data.identification,
                                    "mobile": data.mobile,
                                    "visitpurpose": data.visitpurpose,
                                });
                            }
                        });

                        // QRCode.toString(data._id, {
                        //     type: "utf8"
                        // }, (err, string) => {
                        //     if (err) {
                        //         res.send('Error generating QR code');
                        //     } else {
                        //         // Send the QR code as a response
                        //         // Add spacing between each line
                        //         const lines = string.split('\n');
                        //         const spacedString = lines.join('                                   ');
                        //         res.send({
                        //             "message": "You have created a new visitor invite, Please send the QR code to your visitor.",
                        //             // "qrcode": string,
                        //             "qrcode": spacedString,
                        //             "visitorid": data._id,
                        //             "host": data.host,
                        //             "apartment": data.apartment,
                        //             "name": data.name,
                        //             "carplate": data.carplate,
                        //             "identification": data.identification,
                        //             "mobile": data.mobile,
                        //             "visitpurpose": data.visitpurpose,
                        //         });
                        //     }
                        // });
                    } catch (e) {
                        res.send("Error creating new listing,either host or apartment not found");
                    }
                } else {
                    res.send("You do not have the previlege to create a new visitor");
                }
            } else {
                res.send("You are not logged in");
            }
        });

        /**
         * @swagger
         * /dashboard/approve:
         *   post:
         *     tags:
         *       - Resident
         *     description: Approve a visitor request
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               _id:
         *                 type: string
         *     responses:
         *       200:
         *         description: Reply from the server
         */
        app.post('/dashboard/approve', async (req, res) => {
            if (req.session.user) {
                if (req.session.user.role == "resident") {
                    host = req.session.user.username;
                    apartment = req.session.user.apartment;
                    data = req.body;
                    try {
                        //check if visitor exists
                        result = await client.db("Assignment").collection("Visitors").findOne({
                            _id: data._id
                        });

                        if (result) {
                            if (result.status == "pending" || result.status == "rejected") {

                                await client.db("Assignment").collection("Visitors").updateOne({
                                    _id: data._id
                                }, {
                                    $set: {
                                        status: "approved"
                                    },
                                    $unset: {
                                        reason: ""
                                    }
                                });

                                await client.db("Assignment").collection("Users").updateOne({
                                    _id: host,
                                    apartment: apartment
                                }, {
                                    $pull: {
                                        pendingvisitors: data._id,
                                        blockedvisitors: data._id,
                                    },
                                    $push: {
                                        incomingvisitors: data._id
                                    }
                                });

                                res.send('Visitor with the id: ' + data._id + " has been approved");
                            } else {
                                res.send("Visitor is not pending");
                            }
                        } else {
                            res.send("Visitor not found");
                        }

                    } catch (e) {
                        res.send("Error approving visitor");
                    }
                } else {
                    res.send("You do not have the previlege to approve a visitor");
                }
            } else {
                res.send("You are not logged in");
            }
        });

        /**
         * @swagger
         * /dashboard/reject:
         *   post:
         *     tags:
         *       - Resident
         *     description: Reject a visitor request
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               _id:
         *                 type: string
         *              reason:
         *                type: string
         *     responses:
         *       200:
         *         description: Reply from the server
         */

        app.post('/dashboard/reject', async (req, res) => {
            if (req.session.user) {
                if (req.session.user.role == "resident") {
                    host = req.session.user.username;
                    apartment = req.session.user.apartment;
                    data = req.body;
                    try {
                        //check if visitor exists
                        result = await client.db("Assignment").collection("Visitors").findOne({
                            _id: data._id
                        });

                        if (result) {
                            if (result.status == "pending" || result.status == "approved") {
                                await client.db("Assignment").collection("Visitors").updateOne({
                                    _id: data._id
                                }, {
                                    $set: {
                                        status: "rejected"
                                    },
                                    $push: {
                                        reason: data.reason
                                    }
                                });

                                await client.db("Assignment").collection("Users").updateOne({
                                    _id: host,
                                    apartment: apartment
                                }, {
                                    $pull: {
                                        pendingvisitors: data._id,
                                        incomingvisitors: data._id
                                    },
                                    $push: {
                                        blockedvisitors: data._id
                                    }
                                });

                                res.send('Visitor with the id: ' + data._id + " has been rejected");
                            } else {
                                res.send("Visitor is not pending or approved");
                            }
                        } else {
                            res.send("Visitor not found");
                        }

                    } catch (e) {
                        res.send("Error rejecting visitor");
                    }
                } else {
                    res.send("You do not have the previlege to reject a visitor");
                }
            } else {
                res.send("You are not logged in");
            }
        });

        /**
         * @swagger
         * /check:
         *   post:
         *     tags:
         *       - Security
         *     description: Check in a visitor
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               _id:
         *                 type: string
         *     responses:
         *       200:
         *         description: Reply from the server
         */
        app.post('/check', async (req, res) => {
            if (req.session.user) {
                if (req.session.user.role == "security") {
                    data = req.body;
                    try {
                        //check if visitor exists
                        result = await client.db("Assignment").collection("Visitors").findOne({
                            _id: data._id
                        });

                        if (result) {
                            //check visitor status
                            try {
                                result1 = await client.db("Assignment").collection("Visitors").aggregate([{
                                        $match: {
                                            _id: data._id
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 1,
                                            name: 1,
                                            carplate: 1,
                                            identification: 1,
                                            mobile: 1,
                                            visitpurpose: 1,
                                            status: 1,
                                            qrcode: 1,
                                        }
                                    }
                                ]).toArray();
                            } catch (e) {
                                res.send("Error retrieving visitor status");
                            }

                            //check who is the host
                            try {
                                result2 = await client.db("Assignment").collection("Users").aggregate([{
                                        $match: {
                                            apartment: result.apartment
                                        }
                                    },
                                    {
                                        $project: {
                                            _id: 0, //exclude _id, otherwise it will be included by default
                                            name: 1,
                                            phone: 1,
                                            apartment: 1,
                                        }
                                    }
                                ]).toArray();
                            } catch (e) {
                                res.send("Error retrieving host details");
                            }

                            res.send({
                                to: req.session.user.name,
                                message: "Here is the detail of the visitor and the host.",
                                visitordetails: result1,
                                hostdetails: result2
                            })

                        } else {
                            res.send("Visitor not found");
                        }

                    } catch (e) {
                        res.send("Error checking visitor details");
                    }
                } else {
                    res.send("You do not have the previlege to check in a visitor");
                }
            } else {
                res.send("You are not logged in");
            }
        });


        /**
         * @swagger
         * /checkin:
         *   post:
         *     tags:
         *       - Security
         *     description: Check in a visitor
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               _id:
         *                 type: string
         *     responses:
         *       200:
         *         description: Reply from the server
         */
        app.post('/checkin', async (req, res) => {
            if (req.session.user) {
                if (req.session.user.role == "security") {
                    data = req.body;
                    try {
                        //check if visitor exists
                        result = await client.db("Assignment").collection("Visitors").findOne({
                            _id: data._id
                        });

                        if (result) {
                            if (result.status == "approved") {
                                await client.db("Assignment").collection("Visitors").updateOne({
                                    _id: data._id
                                }, {
                                    $set: {
                                        status: "checkedin",
                                        checkin: getCurrentDateTime()
                                    }
                                });

                                res.send('Visitor with the id: ' + data._id + " has been checked in");
                            } else {
                                res.send("Visitor is either not approved or already checked in");
                            }
                        } else {
                            res.send("Visitor not found");
                        }

                    } catch (e) {
                        res.send("Error checking in visitor");
                    }
                } else {
                    res.send("You do not have the previlege to check in a visitor");
                }
            } else {
                res.send("You are not logged in");
            }
        });

        /**
         * @swagger
         * /checkout:
         *   post:
         *     tags:
         *       - Security
         *     description: Check out a visitor
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               _id:
         *                 type: string
         *     responses:
         *       200:
         *         description: Reply from the server
         */
        app.post('/checkout', async (req, res) => {
            if (req.session.user) {
                if (req.session.user.role == "security") {
                    data = req.body;
                    try {
                        //check if visitor exists
                        result = await client.db("Assignment").collection("Visitors").findOne({
                            _id: data._id
                        });

                        if (result) {
                            if (result.status == "checkedin") {
                                await client.db("Assignment").collection("Visitors").updateOne({
                                    _id: data._id
                                }, {
                                    $set: {
                                        status: "checkedout",
                                        checkout: getCurrentDateTime()
                                    }
                                });

                                await client.db("Assignment").collection("Users").updateOne({
                                    _id: result.host,
                                    apartment: result.apartment
                                }, {
                                    $pull: {
                                        incomingvisitors: data._id
                                    },
                                    $push: {
                                        pastvisitors: data._id
                                    }
                                });

                                res.send('Visitor with the id: ' + data._id + " has been checked out");
                            } else {
                                res.send("Visitor is not checked in");
                            }
                        } else {
                            res.send("Visitor not found");
                        }

                    } catch (e) {
                        res.send("Error checking out visitor");
                    }
                } else {
                    res.send("You do not have the previlege to check out a visitor");
                }
            } else {
                res.send("You are not logged in");
            }
        });

        /**
         * @swagger
         * /logout:
         *   get:
         *     tags:
         *       - Resident
         *       - Security
         *       - Admin
         *     description: Logout of the system
         *     responses:
         *       '200':
         *         description: Reply from the server
         */
        app.get('/logout', async (req, res) => {
            if (req.session.user) {
                req.session.destroy();
                res.send("You have been logged out");
            } else {
                res.send("You are not logged in");
            }
        });

        app.listen(port, () => {
            //console.log(`Example app listening at http://localhost:${port}`)
            console.log(`Server is running on port ${process.env.PORT || 3000}`);
        });

        app.use((err, req, res, next) => {
            console.error(err.stack);
            res.status(500).send('Something went wrong!');
        }); // error handling middleware

        // finally, run the server

    } catch (e) {
        console.error(e);
    }
}

run().catch(console.error); // Run the async function

function getCurrentDateTime() {
    const currentDateTime = new Date();

    const year = currentDateTime.getFullYear();
    const month = String(currentDateTime.getMonth() + 1).padStart(2, '0');
    const day = String(currentDateTime.getDate()).padStart(2, '0');

    const hours = String(currentDateTime.getHours()).padStart(2, '0');
    const minutes = String(currentDateTime.getMinutes()).padStart(2, '0');
    const seconds = String(currentDateTime.getSeconds()).padStart(2, '0');

    const formattedDateTime = `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;

    return formattedDateTime;
}

function visitoridgenerator() {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const hours = String(currentDate.getHours()).padStart(2, '0');
    const minutes = String(currentDate.getMinutes()).padStart(2, '0');
    const seconds = String(currentDate.getSeconds()).padStart(2, '0');
    const currentDateTimeString = `${year}${month}${day}${hours}${minutes}${seconds}`;
    return currentDateTimeString;
}