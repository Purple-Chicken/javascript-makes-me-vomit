let keyHandler: ((e: KeyboardEvent) => void) | null = null;

const html = `
  <h1>Keyboard Listener</h1>
  <p>Press any key and see the code below.</p>
  <pre id="keyOutput"></pre>
`;

const onLoad = () => {
  const output = document.getElementById('keyOutput');
  if (!output) {
    return;
  }
  keyHandler = (e) => {
    output.textContent = `Key: ${e.key}, Code: ${e.code}`;
  };  
  window.addEventListener('keydown', keyHandler);
}

const cleanup = () => {
  if (keyHandler) {
    window.removeEventListener('keydown', keyHandler);
  }
}

export default { html, onLoad, cleanup };
