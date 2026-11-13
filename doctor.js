
import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const loginSection = document.getElementById("loginSection");
const dashboardSection = document.getElementById("dashboardSection");
const loginForm = document.getElementById("loginForm");
const profileForm = document.getElementById("profileForm");

const loginMessage = document.getElementById("loginMessage");
const profileMessage = document.getElementById("profileMessage");
const activationStatus = document.getElementById("activationStatus");
const myPatients = document.getElementById("myPatients");
const photoPreview = document.getElementById("photoPreview");

let currentDoctor = null;
let savedPhoto = "";

function showMessage(element, text, error = false) {
  element.textContent = text;
  element.className = error ? "error" : "status";
}

function addText(parent, tag, text) {
  const el = document.createElement(tag);
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

// ફોટો નાનો કરીને Base64 બનાવવો
async function compressPhoto(file) {
  if (!file) return savedPhoto;

  if (!file.type.startsWith("image/")) {
    throw new Error("યોગ્ય ફોટો પસંદ કરો.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("ફોટો 5 MB કરતાં નાનો પસંદ કરો.");
  }

  const url = URL.createObjectURL(file);

  try {
    const image = new Image();

    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });

    const canvas = document.createElement("canvas");

    const maxSize = 600;
    const scale = Math.min(
      1,
      maxSize / Math.max(image.width, image.height)
    );

    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);

    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    let quality = 0.65;
    let result = canvas.toDataURL("image/jpeg", quality);

    while (result.length > 300000 && quality > 0.30) {
      quality -= 0.08;
      result = canvas.toDataURL("image/jpeg", quality);
    }

    if (result.length > 300000) {
      throw new Error("ફોટો ખૂબ મોટો છે. નાનો ફોટો પસંદ કરો.");
    }

    return result;

  } finally {
    URL.revokeObjectURL(url);
  }
}

// પ્રોફાઇલ લોડ કરવી
async function loadDoctor(user) {
  currentDoctor = user;

  loginSection.classList.add("hidden");
  dashboardSection.classList.remove("hidden");

  const profileRef = doc(db, "doctorProfiles", user.uid);
  const profileSnap = await getDoc(profileRef);

  if (!profileSnap.exists()) {
    showMessage(
      profileMessage,
      "તમારી ડૉક્ટર પ્રોફાઇલ Admin દ્વારા બનાવવામાં આવી નથી.",
      true
    );
    return;
  }

  const data = profileSnap.data();

  document.getElementById("welcomeDoctor").textContent =
    "નમસ્તે, " + (data.name || "ડૉક્ટર");

  document.getElementById("doctorName").value = data.name || "";
  document.getElementById("surname").value = data.surname || "";
  document.getElementById("clinicName").value = data.clinicName || "";
  document.getElementById("area").value = data.area || "";
  document.getElementById("phone").value = data.phone || "";
  document.getElementById("instructions").value =
    data.instructions || "";

  savedPhoto = data.doctorPhoto || "";

  showPhoto(savedPhoto);

  await loadActivation(user.uid);
  await loadPatients(user.uid);
}

// ફોટો પ્રિવ્યૂ
function showPhoto(photo) {
  photoPreview.replaceChildren();

  if (!photo) {
    photoPreview.textContent = "હજુ ફોટો પસંદ કર્યો નથી.";
    return;
  }

  const img = document.createElement("img");
  img.className = "doctor-photo";
  img.src = photo;
  img.alt = "ડૉક્ટરનો ફોટો";
  photoPreview.appendChild(img);
}

// Admin Activation સ્થિતિ
async function loadActivation(uid) {
  try {
    const publicRef = doc(db, "publicDoctors", uid);
    const publicSnap = await getDoc(publicRef);

    if (!publicSnap.exists()) {
      activationStatus.textContent =
        "Admin Activation બાકી છે.";
      return;
    }

    const data = publicSnap.data();

    if (data.adminActive !== true) {
      activationStatus.textContent =
        "Admin Status OFF";
      return;
    }

    if (!data.expiresAt || !data.expiresAt.toDate) {
      activationStatus.textContent =
        "Activation સમયની માહિતી ઉપલબ્ધ નથી.";
      return;
    }

    const expiry = data.expiresAt.toDate();

    if (expiry.getTime() <= Date.now()) {
      activationStatus.textContent =
        "30 દિવસ પૂરા થયા. ક્લિનિક બંધ છે.";
      return;
    }

    activationStatus.textContent =
      "Admin Status ON | સમયમર્યાદા: " +
      expiry.toLocaleString("gu-IN");

  } catch (error) {
    console.error(error);
    activationStatus.textContent =
      "Activation માહિતી લોડ થઈ શકી નથી.";
  }
}

// પોતાના દર્દીઓ જ લોડ કરવા
async function loadPatients(uid) {
  myPatients.textContent = "દર્દીઓ લોડ થઈ રહ્યા છે...";

  try {
    const q = query(
      collection(db, "patientCases"),
      where("doctorUid", "==", uid)
    );

    const snapshot = await getDocs(q);

    myPatients.replaceChildren();

    if (snapshot.empty) {
      myPatients.textContent = "હજુ કોઈ દર્દીની નોંધણી નથી.";
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

      if (patient.patientPhoto) {
        const img = document.createElement("img");
        img.className = "doctor-photo";
        img.src = patient.patientPhoto;
        img.alt = "દર્દીનો ફોટો";
        img.onerror = () => img.remove();
        card.appendChild(img);
      }

      myPatients.appendChild(card);
    });

  } catch (error) {
    console.error(error);
    myPatients.textContent =
      "દર્દીઓ લોડ થઈ શક્યા નથી. Rules તપાસવાની જરૂર છે.";
  }
}

// Login
loginForm.addEventListener("submit", async event => {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  showMessage(loginMessage, "Login થઈ રહ્યું છે...");

  try {
    await signInWithEmailAndPassword(auth, email, password);

  } catch (error) {
    console.error(error);

    showMessage(
      loginMessage,
      "Login થઈ શક્યું નથી. ઈમેલ અને પાસવર્ડ તપાસો.",
      true
    );
  }
});

// પ્રોફાઇલ સેવ
profileForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentDoctor || currentDoctor.isAnonymous) {
    showMessage(profileMessage, "ફરીથી Login કરો.", true);
    return;
  }

  const saveButton = document.getElementById("saveProfile");
  saveButton.disabled = true;
  saveButton.textContent = "સેવ થઈ રહ્યું છે...";

  try {
    const name = document.getElementById("doctorName").value.trim();
    const surname = document.getElementById("surname").value.trim();
    const clinicName = document.getElementById("clinicName").value.trim();
    const area = document.getElementById("area").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const instructions =
      document.getElementById("instructions").value.trim();

    if (!/^[0-9]{10}$/.test(phone)) {
      throw new Error("10 આંકડાનો મોબાઇલ નંબર દાખલ કરો.");
    }

    const photoFile =
      document.getElementById("doctorPhoto").files[0];

    const doctorPhoto = await compressPhoto(photoFile);

    const profileData = {
      name,
      surname,
      clinicName,
      area,
      phone,
      instructions,
      doctorPhoto,
      email: currentDoctor.email || "",
      updatedAt: serverTimestamp()
    };

    const profileRef = doc(
      db,
      "doctorProfiles",
      currentDoctor.uid
    );

    await setDoc(profileRef, profileData, { merge: true });

    // જાહેર પ્રોફાઇલ પહેલેથી હોય તો જ તેની વિગતો અપડેટ કરવી.
    // Admin ના Activation અને Expiry fields બદલવાના નથી.
    const publicRef = doc(
      db,
      "publicDoctors",
      currentDoctor.uid
    );

    const publicSnap = await getDoc(publicRef);

    if (publicSnap.exists()) {
      await updateDoc(publicRef, {
        name,
        surname,
        clinicName,
        area,
        phone,
        instructions,
        doctorPhoto,
        updatedAt: serverTimestamp()
      });
    }

    savedPhoto = doctorPhoto;
    showPhoto(savedPhoto);

    showMessage(
      profileMessage,
      "પ્રોફાઇલ અને ફોટો સફળતાપૂર્વક સેવ થયા."
    );

    await loadActivation(currentDoctor.uid);

  } catch (error) {
    console.error(error);

    showMessage(
      profileMessage,
      error.message || "પ્રોફાઇલ સેવ થઈ શકી નથી.",
      true
    );

  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "પ્રોફાઇલ અને ફોટો સેવ કરો";
  }
});

// પસંદ કરેલો નવો ફોટો બતાવવો
document.getElementById("doctorPhoto").addEventListener(
  "change",
  event => {
    const file = event.target.files[0];

    if (file) {
      const url = URL.createObjectURL(file);
      showPhoto(url);
    } else {
      showPhoto(savedPhoto);
    }
  }
);

// Logout
document.getElementById("logoutButton").addEventListener(
  "click",
  async () => {
    try {
      await signOut(auth);
      window.location.reload();
    } catch (error) {
      console.error(error);
      showMessage(profileMessage, "Logout થઈ શક્યું નથી.", true);
    }
  }
);

// Login સ્થિતિ તપાસવી
onAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous) {
    currentDoctor = null;
    dashboardSection.classList.add("hidden");
    loginSection.classList.remove("hidden");
    return;
  }

  try {
    await loadDoctor(user);
  } catch (error) {
    console.error(error);
    showMessage(
      profileMessage,
      "ડૉક્ટરની માહિતી લોડ થઈ શકી નથી.",
      true
    );
  }
});
