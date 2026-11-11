
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import {
  getAuth
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAxlXXLtSUZoSLrBUipeoNUxpQqMShIOvQ",
  authDomain: "doctor-seva-30f8c.firebaseapp.com",
  projectId: "doctor-seva-30f8c",
  storageBucket: "doctor-seva-30f8c.firebasestorage.app",
  messagingSenderId: "353349764553",
  appId: "1:353349764553:web:ebcc276f7304bb3ee69418"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };

