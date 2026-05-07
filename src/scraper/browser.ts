import { chromium } from 'playwright'
import type { Browser } from 'playwright'

export async function createBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
}
