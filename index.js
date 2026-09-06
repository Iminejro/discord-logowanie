const express = require('express');
const axios = require('axios');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const GUILD_ID = '1482785462979399771';
const ALLOWED_ROLES = [
  '1512045945410551988',
  '1482831139633893396',
  '1482830351150743723'
];

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
    const customToken = await admin.auth().createCustomToken(uid);

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

app.listen(process.env.PORT || 3000);
