const localtunnel = require('localtunnel');
const fs = require('fs');

(async () => {
  try {
    const tunnel = await localtunnel({ port: 3000 });
    const url = tunnel.url;
    console.log('====================================================');
    console.log(' SECURE PUBLIC HTTPS TUNNEL ESTABLISHED');
    console.log('====================================================');
    console.log(' Public HTTPS Scanner Link: ' + url + '/operator.html');
    console.log(' Public HTTPS Dashboard   : ' + url);
    console.log('====================================================');

    fs.writeFileSync('public_url.txt', url + '/operator.html');

    tunnel.on('close', () => {
      console.log('Tunnel closed.');
    });
  } catch (err) {
    console.error('Error starting localtunnel:', err);
  }
})();
