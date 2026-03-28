// const clamd = require('clamdjs');


// const scanner = clamd.createScanner(
//     process.env.CLAMAV_HOST,
//     parseInt(process.env.CLAMAV_PORT)
//   );
  
//   async function virusCheck(buffer) {
//     try {
//       const result = await scanner.scanBuffer(buffer);
//       return !result.includes('FOUND');
//     } catch (error) {
//       console.error('Virus scan failed:', error);
//       return false;
//     }
//   }


// module.exports = { scanner, virusCheck };