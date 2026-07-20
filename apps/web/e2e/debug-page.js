import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ 
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = await browser.newPage();
  
  console.log('Navigating to page...');
  await page.goto('http://localhost:8081/');
  
  console.log('Waiting for load...');
  await page.waitForLoadState('networkidle');
  
  console.log('Page title:', await page.title());
  
  // Get all input elements
  const inputs = await page.$$eval('input', inputs => 
    inputs.map(input => ({
      type: input.type,
      placeholder: input.placeholder,
      name: input.name,
      id: input.id,
      className: input.className
    }))
  );
  
  console.log('Input elements found:', JSON.stringify(inputs, null, 2));
  
  // Get all buttons
  const buttons = await page.$$eval('button', buttons =>
    buttons.map(button => ({
      textContent: button.textContent.trim(),
      type: button.type,
      className: button.className
    }))
  );
  
  console.log('Button elements found:', JSON.stringify(buttons, null, 2));
  
  // Get page text content
  const headings = await page.$$eval('h1, h2, h3, h4, h5, h6', headings =>
    headings.map(h => h.textContent.trim())
  );
  
  console.log('Headings found:', headings);
  
  await browser.close();
})();