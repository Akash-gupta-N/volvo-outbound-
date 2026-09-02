const localtunnel = require('localtunnel');
const fs = require('fs');

async function createTunnel() {
  try {
    const tunnel = await localtunnel({ port: 3000 });
    console.log('====================================================');
    console.log(' LIVE TUNNEL CONNECTED');
    console.log(' Public HTTPS Link: ' + tunnel.url + '/operator.html');
    console.log('====================================================');
    fs.writeFileSync('public_url.txt', tunnel.url + '/operator.html');

    tunnel.on('close', () => {
      console.log('Tunnel connection lost. Reconnecting in 3 seconds...');
      setTimeout(createTunnel, 3000);
    });

    tunnel.on('error', (err) => {
      console.error('Tunnel error:', err);
    });
  } catch (err) {
    console.error('Failed to create tunnel:', err);
    setTimeout(createTunnel, 3000);
  }
}

// Keep process running indefinitely
createTunnel();
setInterval(() => {}, 60000);
