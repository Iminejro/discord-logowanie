const express = require('express');
const axios = require('axios');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());

// Łączenie z Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

app.get('/', (req, res) => {
  res.send('Serwer działa!');
});

app.get('/login', (req, res) => {
  const redirectUri = 'https://' + req.get('host') + '/callback';
  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify`;
  res.redirect(discordAuthUrl);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('Brak kodu autoryzacji.');
  
  const redirectUri = 'https://' + req.get('host') + '/callback';

  try {
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const accessToken = tokenResponse.data.access_token;
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const discordUser = userResponse.data;
    const uid = `discord:${discordUser.id}`;

    // Generowanie klucza do bazy
    const customToken = await admin.auth().createCustomToken(uid);

    // Wysłanie tokenu do głównej strony i zamknięcie okienka
    const html = `
      <html><body><script>
        window.opener.postMessage({ customToken: "${customToken}", displayName: "${discordUser.username}" }, "*");
        window.close();
      </script></body></html>
    `;
    res.send(html);

  } catch (error) {
    console.error(error);
    res.send('Błąd logowania Discord.');
  }
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Serwer uruchomiony pomyślnie!');
});
