import dotenv from 'dotenv';
import { login } from './scraper/login';

dotenv.config();

async function main() {
  const url = process.env.BANDEC_URL || 'http://www.bandec.cu/VirtualBANDEC/';
  const username = process.env.BANDEC_USERNAME || '';
  const password = process.env.BANDEC_PASSWORD || '';
  const pin = process.env.BANDEC_PIN || '';

  if (!username || !password) {
    console.log('Configura BANDEC_USERNAME y BANDEC_PASSWORD en el archivo .env');
    process.exit(1);
  }

  const headed = !process.argv.includes('--headless');

  await login({ url, username, password, pin, headed });
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
