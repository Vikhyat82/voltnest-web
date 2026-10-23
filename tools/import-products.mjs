// One-time import of the starter catalogue (public/data/products.json) into Firestore.
//   cd tools && npm i firebase-admin
//   set GOOGLE_APPLICATION_CREDENTIALS=path\to\serviceAccount.json   (Windows: set / Mac-Linux: export)
//   node import-products.mjs
import { readFileSync } from 'node:fs';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const products = JSON.parse(readFileSync(new URL('../public/data/products.json', import.meta.url), 'utf8'));

const batch = db.batch();
for (const { id, ...data } of products) batch.set(db.doc(`products/${id}`), data);
const settings = db.doc('settings/store');
if (!(await settings.get()).exists) batch.set(settings, {
  storeName: 'VoltNest', tagline: 'Electronic parts for students in Greater Noida. Order online, pay when you pick up.',
  phone: '', whatsapp: '', pickupAddress: 'Your pickup address here', pickupHours: 'Mon–Sat, 10 AM – 8 PM',
  deliveryEnabled: true, deliveryFee: 30, freeDeliveryAbove: 500, minOrder: 0, announcement: '',
  areas: ['Knowledge Park I', 'Knowledge Park II', 'Knowledge Park III', 'Knowledge Park IV', 'Knowledge Park V', 'Alpha 1 / Alpha 2', 'Beta 1 / Beta 2', 'Gamma 1 / Gamma 2', 'Delta 1 / Delta 2 / Delta 3', 'Pari Chowk', 'Sharda University area', 'Galgotias University area', 'GL Bajaj / NIET / GNIOT area', 'Gautam Buddha University area', 'Techzone / Greater Noida West']
});
await batch.commit();
console.log(`Imported ${products.length} products.`);
