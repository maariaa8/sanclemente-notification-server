const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Inizializza Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

console.log('🔥 Firebase Admin inizializzato');

// Ascolta nuovi annunci
db.collection('annunci').onSnapshot(async (snapshot) => {
  console.log(`📬 Snapshot ricevuto: ${snapshot.docChanges().length} cambiamenti`);
  
  for (const change of snapshot.docChanges()) {
    if (change.type === 'added') {
      const annuncio = change.doc.data();
      
      // Controlla se è nuovo (ultimi 30 secondi)
      if (annuncio.timestamp) {
        const createdAt = annuncio.timestamp.toDate();
        const now = new Date();
        const diff = (now - createdAt) / 1000;
        
        console.log(`⏱️ Annuncio creato ${diff} secondi fa`);
        
        if (diff < 30) {
          console.log('📢 Nuovo annuncio:', annuncio.titolo);
          await sendNotificationToAll(annuncio);
        } else {
          console.log('⏭️ Annuncio troppo vecchio, skip');
        }
      }
    }
  }
});

// Invia notifica a tutti gli utenti
async function sendNotificationToAll(annuncio) {
  try {
    const usersSnapshot = await db.collection('users')
      .where('fcm_token', '!=', null)
      .get();

    const tokens = [];
    usersSnapshot.forEach(doc => {
      const token = doc.data().fcm_token;
      if (token) tokens.push(token);
    });

    if (tokens.length === 0) {
      console.log('⚠️ Nessun token trovato');
      return;
    }

    console.log(`📱 Invio a ${tokens.length} dispositivi`);

    const testoBreve = annuncio.testo.length > 100 
      ? annuncio.testo.substring(0, 100) + '...' 
      : annuncio.testo;

    const message = {
      notification: {
        title: `📢 Nuovo annuncio: ${annuncio.titolo}`,
        body: testoBreve
      },
      android: {
        notification: {
          channelId: 'annunci_channel',
          priority: 'high',
          sound: 'default'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default'
          }
        }
      },
      tokens: tokens
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`✅ Inviate: ${response.successCount}/${tokens.length}`);
    
    if (response.failureCount > 0) {
      console.log(`❌ Errori: ${response.failureCount}`);
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`Errore token ${idx}:`, resp.error?.message);
        }
      });
    }
  } catch (error) {
    console.error('❌ Errore invio notifiche:', error);
  }
}

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'Server notifiche SanClemente attivo',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server in ascolto su porta ${PORT}`);
});