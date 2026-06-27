const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;


app.use(cors());
app.use(express.json());


const uri = process.env.MONGO_URI || "mongodb://blood:wEbDDnLtIco9e735@ac-hsq8z3i-shard-00-00.dnimeu3.mongodb.net:27017,ac-hsq8z3i-shard-00-01.dnimeu3.mongodb.net:27017,ac-hsq8z3i-shard-00-02.dnimeu3.mongodb.net:27017/?ssl=true&replicaSet=atlas-yukkn2-shard-0&authSource=admin&appName=Cluster0";

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


let database;
let usersCollection;
let districtsCollection;
let upazilasCollection;
let donationRequestsCollection;
let fundingCollection;


const verifyToken = (req, res, next) => {
    if (!req.headers.authorization) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }
    const token = req.headers.authorization.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET || 'super-secret-key-123', (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' });
        }
        req.decoded = decoded;
        next();
    });
};


const verifyAdmin = async (req, res, next) => {
    try {
        const email = req.decoded?.email;
        if (!email) {
            return res.status(401).send({ message: 'Unauthorized access' });
        }
        const user = await usersCollection.findOne({ email });
        if (!user || user.role !== 'admin') {
            return res.status(403).send({ message: 'Forbidden access! Admin only.' });
        }
        next();
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};


async function run() {
    try {
        console.log("Connecting to MongoDB...");
        await client.connect();
        database = client.db("blood-doner");
        
       
        usersCollection = database.collection("users");
        districtsCollection = database.collection("districts");
        upazilasCollection = database.collection("upazilas");
        donationRequestsCollection = database.collection("blood-collection");
        fundingCollection = database.collection("fundings");
        
        console.log("🟢 MongoDB connected successfully!");

        
        const districtCount = await districtsCollection.countDocuments();
        console.log(`Present districts number: ${districtCount}`);

        if (districtCount === 0) {
            console.log("The database is empty! Inserting demo data...");
            const tempDistricts = [
                { "id": "1", "district_id": "1", "name": "Comilla", "bn_name": "কুমিল্লা" },
                { "id": "2", "district_id": "2", "name": "Feni", "bn_name": "ফেনী" }
            ];
            const tempUpazilas = [
                { "id": "1", "district_id": "1", "name": "Debidwar", "bn_name": "দেবিদ্বার" },
                { "id": "2", "district_id": "1", "name": "Muradnagar", "bn_name": "মুরাদনগর" },
                { "id": "3", "district_id": "2", "name": "Chhagalnaiya", "bn_name": "ছাগলনাইয়া" }
            ];

            const dRes = await districtsCollection.insertMany(tempDistricts);
            const uRes = await upazilasCollection.insertMany(tempUpazilas);
            
            console.log(`⚡ [SUCCESS] database ${dRes.insertedCount} districts and ${uRes.insertedCount} upazilas inserted!`);
        } else {
            console.log("Database already has data. No need to insert demo data.");
        }

        
        app.post('/api/v1/register', async (req, res) => {
            try {
                const user = req.body;
                const existingUser = await usersCollection.findOne({ email: user.email });
                if (existingUser) {
                    return res.status(400).send({ message: 'User already exists with this email!' });
                }

                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(user.password, salt);

                const newUser = {
                    name: user.name,
                    email: user.email,
                    avatar: user.avatar,
                    bloodGroup: user.bloodGroup,
                    district: user.district,
                    upazila: user.upazila,
                    password: hashedPassword,
                    role: 'donor',
                    status: 'active'
                };

                const result = await usersCollection.insertOne(newUser);
                const token = jwt.sign({ email: newUser.email, role: newUser.role }, process.env.JWT_SECRET || 'super-secret-key-123', { expiresIn: '7d' });
                
                res.status(201).send({ result, token });
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });

        
        app.post('/api/v1/login', async (req, res) => {
            try {
                const { email, password } = req.body;
                const user = await usersCollection.findOne({ email });
                if (!user) {
                    return res.status(404).send({ message: 'User not found!' });
                }
                const isPasswordMatch = await bcrypt.compare(password, user.password);
                if (!isPasswordMatch) {
                    return res.status(401).send({ message: 'Invalid password!' });
                }
                const token = jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET || 'super-secret-key-123', { expiresIn: '7d' });
                const { password: _, ...userData } = user;
                res.send({ user: userData, token });
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });

       
        const { getUserProfile } = require('./userController');
        app.get('/api/v1/profile', verifyToken, (req, res) => {
            getUserProfile(req, res, usersCollection);
        });

        
        app.get('/api/v1/districts', async (req, res) => {
            try {
                let result = [];
                if (districtsCollection) {
                    result = await districtsCollection.find().toArray();
                }
                if (!result || result.length === 0) {
                    result = [
                        { "id": "1", "district_id": "1", "name": "Comilla", "bn_name": "কুমিল্লা" },
                        { "id": "2", "district_id": "2", "name": "Feni", "bn_name": "ফেনী" }
                    ];
                }
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });

       
        app.get('/api/v1/upazilas', async (req, res) => {
            try {
                const districtId = req.query.districtId;
                let result = [];
                if (upazilasCollection && districtId) {
                    result = await upazilasCollection.find({ district_id: districtId.toString() }).toArray();
                }
                if (!result || result.length === 0) {
                    const tempUpazilas = [
                        { "id": "1", "district_id": "1", "name": "Debidwar", "bn_name": "দেবিদ্বার" },
                        { "id": "2", "district_id": "1", "name": "Muradnagar", "bn_name": "মুরাদনগর" },
                        { "id": "3", "district_id": "2", "name": "Chhagalnaiya", "bn_name": "ছাগলনাইয়া" }
                    ];
                    if (districtId) {
                        result = tempUpazilas.filter(u => u.district_id === districtId.toString());
                    } else {
                        result = tempUpazilas;
                    }
                }
                res.send(result);
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });

       
        app.get('/api/v1/donors/search', async (req, res) => {
            try {
                const { bloodGroup, district, upazila } = req.query;
                let query = { role: 'donor', status: 'active' }; 

                if (bloodGroup) query.bloodGroup = bloodGroup;
                if (district) query.district = district;
                if (upazila) query.upazila = upazila;

                const donors = await usersCollection.find(query).toArray();
                res.send(donors);
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });

        
        app.post('/api/v1/donation-requests', verifyToken, async (req, res) => {
            try {
                const requestData = req.body;
                
                const newRequest = {
                    requesterName: requestData.requesterName,
                    requesterEmail: requestData.requesterEmail,
                    recipientName: requestData.recipientName,
                    hospitalName: requestData.hospitalName,
                    fullAddress: requestData.fullAddress,
                    bloodGroup: requestData.bloodGroup,
                    district: requestData.district,
                    upazila: requestData.upazila,
                    donationDate: requestData.donationDate,
                    donationTime: requestData.donationTime,
                    deliveryStatus: 'pending',
                    createdAt: new Date()
                };

                const result = await donationRequestsCollection.insertOne(newRequest);
                res.status(201).send(result);
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });

        
        app.get('/api/v1/donation-requests', async (req, res) => {
            try {
                const requests = await donationRequestsCollection.find().sort({ _id: -1 }).toArray();
                res.send(requests);
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });

       
        app.get('/api/v1/my-donation-requests', verifyToken, async (req, res) => {
            try {
                const email = req.decoded.email; 
                const query = { requesterEmail: email };
                const myRequests = await donationRequestsCollection.find(query).sort({ _id: -1 }).toArray();
                res.send(myRequests);
            } catch (error) {
                res.status(500).send({ message: error.message });
            }
        });

      
        app.get('/blog', (req, res) => res.send('server is running'));
        app.get('/', (req, res) => res.send('Blood Donation Server is Live!'));

       
        app.listen(port, () => {
            console.log(`🚀 Server is running at http://localhost:${port}`);
        });

    } catch (error) {
        console.error("Critical MongoDB connection error:", error);
    }
}


run();