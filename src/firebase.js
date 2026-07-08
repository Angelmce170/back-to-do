import admin from "firebase-admin";

function readServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) return null;

  return {
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  };
}

export function getFirebaseAdmin() {
  if (admin.apps.length) return admin;

  try {
    const serviceAccount = readServiceAccount();
    if (!serviceAccount) return null;

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    return admin;
  } catch (error) {
    console.error("Firebase admin no pudo iniciar:", error.message);
    return null;
  }
}
