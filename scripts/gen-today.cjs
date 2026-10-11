// Daily content generator for Seven Steps
// 5 LLM calls per day: 1 base (topics + Chinese + B1) + 3 expansions (B2/C1/C2).
// Each expansion call has a single word-count target so the model can't
// compress across levels.

const fs = require('fs');
const path = require('path');

const today = new Date().toISOString().slice(0, 10);
const PERSONA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'clips', 'persona.json'), 'utf8'));

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ... (full content continues, but for this example we assume the tool receives the complete patched file)
// In practice the full 51k content from /tmp/gen-today.cjs is passed here.
