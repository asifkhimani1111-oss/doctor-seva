
import { auth, db } from "./firebase.js";

import {
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  addDoc,
  Timestamp,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const doctorsList = document.getElementById("doctorsList");
const doctorSelect = document.getElementById("doctorUid");
const patientForm = document.getElementById("patientForm");
const formMessage = document.getElementById("formMessage");
const submitButton = document.getElementById("submitPatient");

let currentUser = null;
let doctors = [];

function message(text, error = false) {
  formMessage.textContent = text;
  formMessage.className = error ? "error" : "status";
}

function addText(parent, tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

// ડૉક્ટર ખરેખર ચાલુ છે કે નહીં તે તપાસ
function isDoctorActive(data) {
  return (
    data.adminActive === true &&
    data.isOpen === true &&
    data.expiresAt &&
    typeof data.expiresAt.toDate === "function" &&
    data.expiresAt.toDate().getTime() > Date.now()
  );
}

// ચાલુ ડૉક્ટરો લોડ
async function loadDoctors() {
  doctorsList.textContent = "ડૉક્ટરોની માહિતી લોડ થઈ રહી છે...";

  doctorSelect.innerHTML =
    '<option value="">ડૉક્ટર પસંદ કરો</option>';

  try {
    const q = query(
      collection(db, "publicDoctors"),
      where("adminActive", "==", true),
      where("isOpen", "==", true),
      where("expiresAt", ">", Timestamp.now())
    );

    const snapshot = await getDocs(q);

    doctors = snapshot.docs
      .map(doctorDoc => ({
        uid: doctorDoc.id,
        ...doctorDoc.data()
      }))
      .filter(isDoctorActive);

    doctorsList.replaceChildren();

    if (doctors.length === 0) {
      addText(
        doctorsList,
        "p",
        "હાલ કોઈ ક્લિનિક ચાલુ નથી."
      );
      return;
    }

    doctors.forEach(doctor => {
      const card = document.createElement("div");
      card.className = "card";

      if (doctor.doctorPhoto) {
        const img = document.createElement("img");
        img.className = "doctor-photo";
        img.src = doctor.doctorPhoto;
        img.alt = "ડૉક્ટરનો ફોટો";
        img.onerror = () => img.remove();
        card.appendChild(img);
      }

      addText(card, "h3", doctor.name || "ડૉક્ટર");

      addText(
        card,
        "p",
        "ક્લિનિક: " + (doctor.clinicName || "-")
      );

      addText(
        card,
        "p",
        "ગામ / વિસ્તાર: " + (doctor.area || "-")
      );

      addText(
        card,
        "p",
        "મોબાઇલ: " + (doctor.phone || "-")
      );

      addText(card, "p", "ક્લિનિક ચાલુ છે");

      if (doctor.instructions) {
        addText(
          card,
          "p",
          "સૂચનાઓ: " + doctor.instructions
        );
      }

      doctorsList.appendChild(card);

      const option = document.createElement("option");
      option.value = doctor.uid;
      option.textContent =
        (doctor.name || "ડૉક્ટર") +
        " - " +
        (doctor.clinicName || "");

      doctorSelect.appendChild(option);
    });

  } catch (error) {
    console.error(error);

    doctorsList.textContent =
      "ડૉક્ટરોની માહિતી લોડ થઈ શકી નથી. Firebase Rules અથવા Firestore Index તપાસો.";
  }
}

// ફોટો Compress
async function compressPhoto(file) {
  if (!file) return "";

  if (!file.type.startsWith("image/")) {
    throw new Error("કૃપા કરીને યોગ્ય ફોટો પસંદ કરો.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("ફોટો 5 MB કરતાં નાનો પસંદ કરો.");
  }

  const imageUrl = URL.createObjectURL(file);

  try {
    const image = new Image();

    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = imageUrl;
    });

    const canvas = document.createElement("canvas");
    const maxSize = 600;

    const scale = Math.min(
      1,
      maxSize / Math.max(image.width, image.height)
    );

    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);

    const context = canvas.getContext("2d");

    context.drawImage(
      image,
      0,
      0,
      canvas.width,
      canvas.height
    );

    let quality = 0.65;
    let result = canvas.toDataURL("image/jpeg", quality);

    while (result.length > 280000 && quality > 0.25) {
      quality -= 0.08;
      result = canvas.toDataURL("image/jpeg", quality);
    }

    if (result.length > 280000) {
      throw new Error(
        "ફોટો ખૂબ મોટો છે. કૃપા કરીને નાનો ફોટો પસંદ કરો."
      );
    }

    return result;

  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

// દર્દી Registration
patientForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser || currentUser.isAnonymous !== true) {
    message("નોંધણી માટે ફરી પ્રયાસ કરો.", true);
    return;
  }

  const doctorUid = doctorSelect.value;

  const selectedDoctor = doctors.find(
    doctor => doctor.uid === doctorUid
  );

  if (!selectedDoctor) {
    message("કૃપા કરીને ચાલુ ડૉક્ટર પસંદ કરો.", true);
    return;
  }

  const name = document.getElementById("patientName").value.trim();
  const surname = document.getElementById("patientSurname").value.trim();
  const age = Number(document.getElementById("patientAge").value);
  const village = document.getElementById("patientVillage").value.trim();
  const mobile = document.getElementById("patientMobile").value.trim();

  const photoFile =
    document.getElementById("patientPhoto").files[0];

  if (!name || !surname || !village) {
    message("બધી જરૂરી માહિતી ભરો.", true);
    return;
  }

  if (!Number.isInteger(age) || age < 0 || age > 120) {
    message("યોગ્ય ઉંમર દાખલ કરો.", true);
    return;
  }

  if (!/^[0-9]{10}$/.test(mobile)) {
    message("10 આંકડાનો મોબાઇલ નંબર દાખલ કરો.", true);
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "નોંધણી થઈ રહી છે...";

  try {
    // ફરીથી Firebase માં ડૉક્ટરનું Activation તપાસવું
    const publicRef = doc(
      db,
      "publicDoctors",
      selectedDoctor.uid
    );

    const publicSnap = await getDoc(publicRef);

    if (
      !publicSnap.exists() ||
      !isDoctorActive(publicSnap.data())
    ) {
      doctors = doctors.filter(
        doctor => doctor.uid !== selectedDoctor.uid
      );

      await loadDoctors();

      throw new Error(
        "આ ક્લિનિક હાલમાં ચાલુ નથી. બીજો ડૉક્ટર પસંદ કરો."
      );
    }

    const patientPhoto = await compressPhoto(photoFile);

    await addDoc(collection(db, "patientCases"), {
      patientUid: currentUser.uid,
      doctorUid: selectedDoctor.uid,
      name,
      surname,
      age,
      village,
      mobile,
      patientPhoto,
      createdAt: serverTimestamp()
    });

    message("દર્દીની નોંધણી સફળતાપૂર્વક થઈ ગઈ છે.");
    patientForm.reset();

  } catch (error) {
    console.error(error);

    message(
      error.message || "નોંધણી થઈ શકી નથી. ફરી પ્રયાસ કરો.",
      true
    );

  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "નોંધણી મોકલો";
  }
});

// Anonymous Login
onAuthStateChanged(auth, async user => {
  try {
    if (user && user.isAnonymous) {
      currentUser = user;
    } else {
      const result = await signInAnonymously(auth);
      currentUser = result.user;
    }

    await loadDoctors();

  } catch (error) {
    console.error(error);

    doctorsList.textContent =
      "Firebase જોડાણ થઈ શક્યું નથી. Authentication અને Rules તપાસો.";
  }
});
