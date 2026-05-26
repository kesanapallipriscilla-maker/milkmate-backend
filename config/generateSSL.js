const forge = require('node-forge');
const fs    = require('fs');
const path  = require('path');

const keys  = forge.pki.rsa.generateKeyPair(2048);
const cert  = forge.pki.createCertificate();

cert.publicKey      = keys.publicKey;
cert.serialNumber   = '01';
cert.validity.notBefore = new Date();
cert.validity.notAfter  = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 2);

const attrs = [
  { name: 'commonName',         value: '192.168.1.41' },
  { name: 'organizationName',   value: 'MilkMate Dev' },
];
cert.setSubject(attrs);
cert.setIssuer(attrs);
cert.setExtensions([
  { name: 'subjectAltName', altNames: [
    { type: 7, ip: '192.168.1.41' },
    { type: 2, value: 'localhost' },
  ]},
  { name: 'basicConstraints', cA: true },
]);
cert.sign(keys.privateKey, forge.md.sha256.create());

const sslDir = path.join(__dirname, '..', 'ssl');
fs.writeFileSync(path.join(sslDir, 'key.pem'),  forge.pki.privateKeyToPem(keys.privateKey));
fs.writeFileSync(path.join(sslDir, 'cert.pem'), forge.pki.certificateToPem(cert));

console.log('SSL certificates generated in /backend/ssl/');
