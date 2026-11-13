
import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  Timestamp,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// અધિકૃત Admin UID
const ADMIN_UID = "T6HtvOLrm5VYXHUuzuU5FZRZxGf2";

const adminLogin = document.getElementById("adminLogin");
const adminDashboard = document.getElementById("adminDashboard");
const loginForm = document.getElementById("adminLoginForm");
const loginMessage = document.getElementById("adminLoginMessage");
const doctorsList = document.getElementById("doctorsAdminList");
const patientsList = document.getElementById("allPatients");

let currentAdmin = null;

function showMessage(element, text, error = false) {
  element.textContent = text;
  element.className = error ? "error" : "status";
}

function addText(parent, tag, value) {
  const el = document.createElement(tag);
  el.textContent = value;
  parent.appendChild(el);
  return el;
}

// Admin ઓળખ તપાસ
function checkAdmin(user) {
  return user &&
    !user.isAnonymous &&
    user.uid === ADMIN_UID;
}

// Admin Login
loginForm.addEventListener("submit", async event => {
  event.preventDefault();

  const email = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;

  showMessage(loginMessage, "Login થઈ રહ્યું છે...");

  try {
    const result = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    if (!checkAdmin(result.user)) {
      await signOut(auth);
      showMessage(
        loginMessage,
        "આ એકાઉન્ટને Admin પરવાનગી નથી.",
        true
      );
    }

  } catch (error) {
    console.error(error);
    showMessage(
      loginMessage,
      "Login થઈ શક્યું નથી. ઈમેલ અને પાસવર્ડ તપાસો.",
      true
    );
  }
});

// ડૉક્ટરો લોડ
async function loadDoctors() {
  doctorsList.textContent = "ડૉક્ટરો લોડ થઈ રહ્યા છે...";

  try {
    const snapshot = await getDocs(
      collection(db, "doctorProfiles")
    );

    doctorsList.replaceChildren();

    if (snapshot.empty) {
      doctorsList.textContent = "હજુ કોઈ ડૉક્ટર નથી.";
      return;
    }

    for (const doctorDoc of snapshot.docs) {
      const uid = doctorDoc.id;
      const doctor = doctorDoc.data();

      const card = document.createElement("div");
      card.className = "card";

      addText(
        card,
        "h3",
        (doctor.name || "") + " " + (doctor.surname || "")
      );

      addText(card, "p", "ક્લિનિક: " + (doctor.clinicName || "-"));
      addText(card, "p", "વિસ્તાર: " + (doctor.area || "-"));
      addText(card, "p", "મોબાઇલ: " + (doctor.phone || "-"));
      addText(card, "p", "ઈમેલ: " + (doctor.email || "-"));

      const publicRef = doc(db, "publicDoctors", uid);
      const publicSnap = await getDoc(publicRef);
      const publicData = publicSnap.exists()
        ? publicSnap.data()
        : {};

      const expiry = publicData.expiresAt?.toDate
        ? publicData.expiresAt.toDate()
        : null;

      const activeNow =
        publicData.adminActive === true &&
        expiry &&
        expiry.getTime() > Date.now();

      addText(
        card,
        "p",
        activeNow
          ? "ક્લિનિક: ચાલુ"
          : "ક્લિનિક: બંધ / Activation બાકી"
      );

      const activateButton = document.createElement("button");
      activateButton.type = "button";
      activateButton.textContent = "30 દિવસ માટે ચાલુ કરો";

      activateButton.addEventListener("click", async () => {
        if (!checkAdmin(currentAdmin)) return;

        activateButton.disabled = true;

        try {
          const now = new Date();
          const expiryDate = new Date(
            now.getTime() + 30 * 24 * 60 * 60 * 1000
          );

          await setDoc(publicRef, {
            doctorUid: uid,
            name: doctor.name || "",
            surname: doctor.surname || "",
            clinicName: doctor.clinicName || "",
            area: doctor.area || "",
            phone: doctor.phone || "",
            instructions: doctor.instructions || "",
            doctorPhoto: doctor.doctorPhoto || "",
            adminActive: true,
            isOpen: true,
            activatedAt: Timestamp.fromDate(now),
            expiresAt: Timestamp.fromDate(expiryDate),
            updatedAt: serverTimestamp()
          });

          alert("ક્લિનિક 30 દિવસ માટે ચાલુ થઈ ગઈ છે.");
          await loadDoctors();

        } catch (error) {
          console.error(error);
          alert("Activation થઈ શક્યું નથી. Firestore Rules તપાસો.");
          activateButton.disabled = false;
        }
      });

      card.appendChild(activateButton);

      const offButton = document.createElement("button");
      offButton.type = "button";
      offButton.textContent = "ક્લિનિક બંધ કરો";

      offButton.addEventListener("click", async () => {
        if (!checkAdmin(currentAdmin)) return;

        offButton.disabled = true;

        try {
          if (publicSnap.exists()) {
            await updateDoc(publicRef, {
              adminActive: false,
              isOpen: false,
              updatedAt: serverTimestamp()
            });
          }

          alert("ક્લિનિક બંધ કરવામાં આવી છે.");
          await loadDoctors();

        } catch (error) {
          console.error(error);
          alert("ક્લિનિક બંધ થઈ શકી નથી. Rules તપાસો.");
          offButton.disabled = false;
        }
      });

      card.appendChild(offButton);
      doctorsList.appendChild(card);
    }

  } catch (error) {
    console.error(error);
    doctorsList.textContent =
      "ડૉક્ટરો લોડ થઈ શક્યા નથી. Firestore Rules તપાસો.";
  }
}

// બધા દર્દીઓ લોડ
async function loadAllPatients() {
  patientsList.textContent = "દર્દીઓ લોડ થઈ રહ્યા છે...";

  try {
    const snapshot = await getDocs(
      collection(db, "patientCases")
    );

    patientsList.replaceChildren();

    if (snapshot.empty) {
      patientsList.textContent = "હજુ કોઈ દર્દી નોંધાયેલ નથી.";
      return;
    }

    snapshot.forEach(patientDoc => {
      const patient = patientDoc.data();

      const card = document.createElement("div");
      card.className = "card";

      addText(
        card,
        "h3",
        (patient.name || "") + " " + (patient.surname || "")
      );

      addText(card, "p", "ઉંમર: " + (patient.age ?? "-"));
      addText(card, "p", "ગામ: " + (patient.village || "-"));
      addText(card, "p", "મોબાઇલ: " + (patient.mobile || "-"));
      addText(card, "p", "ડૉક્ટર UID: " + (patient.doctorUid || "-"));

      if (patient.patientPhoto) {
        const img = document.createElement("img");
        img.className = "doctor-photo";
        img.src = patient.patientPhoto;
        img.alt = "દર્દીનો ફોટો";
        img.onerror = () => img.remove();
        card.appendChild(img);
      }

      patientsList.appendChild(card);
    });

  } catch (error) {
    console.error(error);
    patientsList.textContent =
      "દર્દીઓ લોડ થઈ શક્યા નથી. Firestore Rules તપાસો.";
  }
}

// Admin Dashboard
async function openDashboard(user) {
  if (!checkAdmin(user)) {
    currentAdmin = null;
    adminLogin.classList.remove("hidden");
    adminDashboard.classList.add("hidden");
    return;
  }

  currentAdmin = user;

  adminLogin.classList.add("hidden");
  adminDashboard.classList.remove("hidden");

  document.getElementById("adminWelcome").textContent =
    "નમસ્તે Admin";

  await loadDoctors();
  await loadAllPatients();
}

// Logout
document.getElementById("adminLogout").addEventListener(
  "click",
  async () => {
    await signOut(auth);
    window.location.reload();
  }
);

// Login સ્થિતિ
onAuthStateChanged(auth, async user => {
  if (!checkAdmin(user)) {
    currentAdmin = null;
    adminLogin.classList.remove("hidden");
    adminDashboard.classList.add("hidden");
    return;
  }

  try {
    await openDashboard(user);
  } catch (error) {
    console.error(error);
    showMessage(
      loginMessage,
      "Admin માહિતી લોડ થઈ શકી નથી.",
      true
    );
  }
});
