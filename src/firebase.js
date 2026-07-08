import admin from "firebase-admin";

function readServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    return {
      projectId: serviceAccount.projectId || serviceAccount.project_id,
      clientEmail: serviceAccount.clientEmail || serviceAccount.client_email,
      privateKey: (serviceAccount.privateKey || serviceAccount.private_key || "").replace(/\\n/g, "\n"),
    };
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
  if (admin.getApps().length) return admin;

  try {
    const serviceAccount = readServiceAccount();
    if (!serviceAccount) return null;

    admin.initializeApp({
      credential: admin.cert(serviceAccount),
    });

    return admin;
  } catch (error) {
    console.error("Firebase admin no pudo iniciar:", error.message);
    return null;
  }
}
