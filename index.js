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
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const REQUIRED_ROLE = process.env.REQUIRED_ROLE_ID;

app.get('/', (req, res) => {
  res.send('Serwer działa!');
});

app.get('/login', (req, res) => {
  const redirectUri = 'https://' + req.get('host') + '/callback';
  // Dodano uprawnienie: guilds.members.read
  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds.members.read`;
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
    
    // 1. Pobranie podstawowych danych o użytkowniku
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const discordUser = userResponse.data;

    // 2. Sprawdzenie ról na Twoim serwerze
    let hasRole = false;
    try {
      const memberResponse = await axios.get(`https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const roles = memberResponse.data.roles;
      if (roles.includes(REQUIRED_ROLE)) {
        hasRole = true;
      }
    } catch (memberError) {
      console.error("Użytkownik nie jest na serwerze lub wystąpił błąd odczytu ról.");
    }

    if (!hasRole) {
      const errorHtml = `
        <html><body style="font-family: sans-serif; text-align: center; margin-top: 50px;">
          <h2 style="color: #c62828;">Odmowa dostępu</h2>
          <p>Nie masz wymaganej rangi na naszym serwerze Discord!</p>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body></html>
      `;
      return res.send(errorHtml);
    }

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
    res.send('Błąd logowania Discord. Spróbuj ponownie.');
  }
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Serwer uruchomiony pomyślnie!');
});
