const express = require('express');
const axios = require('axios');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const GUILD_ID = '1482785462979399771';
const ALLOWED_ROLES = [
  '1548602405556326451',
  '1482831139633893396',
  '1482830351150743723'
];

const ADMIN_DISCORD_IDS = [
  '406609699702833152',
  '481719107520299019',
  '1279934407204929546',
  '1367170282166681694'
];

const TELEGRAM_BOT_TOKEN = '8489838477:AAFY_La99HH9VeuFOgWzspCrUjw0NKCsKzs';
const TELEGRAM_CHAT_ID = '-1003922416007';

let lastAlertTime = 0;

app.get('/', (req, res) => {
  res.send('Serwer dziala');
});

app.get('/login', (req, res) => {
  const redirectUri = 'https://' + req.get('host') + '/callback';
  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds.members.read`;
  res.redirect(discordAuthUrl);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('Brak kodu');

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

    let hasRole = false;
    let serverNickname = null;

    try {
      const memberResponse = await axios.get(`https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const roles = memberResponse.data.roles;
      if (roles.some(role => ALLOWED_ROLES.includes(role))) {
        hasRole = true;
      }

      serverNickname = memberResponse.data.nick;
    } catch (err) {
      console.error(err);
    }

    if (!hasRole) {
      return res.send(`
        <html><body style="background:#181a1b; color:#e8e6e3; font-family:sans-serif; text-align:center; padding-top:50px;">
          <h2 style="color:#c62828;">Brak dostępu</h2>
          <p>Nie masz wymaganej rangi na serwerze Discord.</p>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body></html>
      `);
    }

    const uid = `discord:${discordUser.id}`;
    const claims = {
      admin: ADMIN_DISCORD_IDS.includes(discordUser.id)
    };

    const customToken = await admin.auth().createCustomToken(uid, claims);

    const bestDisplayName = serverNickname || discordUser.global_name || discordUser.username;

    res.send(`
      <html><body><script>
        window.opener.postMessage({ customToken: "${customToken}", displayName: "${bestDisplayName}" }, "*");
        window.close();
      </script></body></html>
    `);

  } catch (error) {
    console.error(error);
    res.send('Blad logowania');
  }
});

app.post('/api/alert-v3', async (req, res) => {
  const now = Date.now();
  if (now - lastAlertTime < 60000) {
    const remaining = Math.ceil((60000 - (now - lastAlertTime)) / 1000);
    return res.status(429).json({ error: `Odczekaj ${remaining}s!` });
  }

  const user = req.body.user || 'Gracz';
  const location = req.body.location || 'Nie wybrano';

  const text = `🚨 ALARM V3! BITWA!\n\nGracz: ${user}\nLokacja: ${location}\nCzas: ${new Date().toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw' })}`;

  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: text
    });

    lastAlertTime = now;
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad wysylania na telegram' });
  }
});

app.listen(process.env.PORT || 3000);
