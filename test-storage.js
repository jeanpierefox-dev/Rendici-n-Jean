import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);

async function run() {
  try {
    // We don't have the user's password, so we might get permission denied if not logged in.
    // Let's just try anonymously if possible, or skip auth and see if rules allow it.
    const testRef = ref(storage, 'test.txt');
    await uploadString(testRef, 'test');
    console.log('Upload success');
  } catch (e) {
    console.error('Upload failed:', e.message);
  }
  process.exit(0);
}
run();
