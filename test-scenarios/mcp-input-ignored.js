import WebSocket from 'ws';

async function testInputIgnored() {
  console.log('Starting test: inputs are ignored while screencast frames stream');
  
  try {
    const sessionResponse = await fetch('http://localhost:3000/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startUrl: 'data:text/html,<button id="btn">Click</button>' }),
    });

    if (!sessionResponse.ok) {
      throw new Error(`Failed to create session: ${sessionResponse.status}`);
    }

    const response = await sessionResponse.json();
    const { sessionId, token } = response.data;
    console.log(`Created session: ${sessionId}`);

    const startResponse = await fetch(`http://localhost:3000/api/sessions/${sessionId}/start`, { method: 'POST' });
    if (!startResponse.ok) {
      throw new Error(`Failed to start session: ${startResponse.status}`);
    }
    console.log('Started session');

    const ws = new WebSocket(`ws://localhost:3000/ws?sessionId=${sessionId}&token=${token}`);
    const messages = [];

    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        console.log('WebSocket connected');
        resolve();
      });
      ws.on('error', reject);
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        messages.push(message);
        console.log(`Received message: ${message.type}`);
      } catch {
        // parsing errors are ignored
      }
    });

    console.log('Waiting for screencast frame...');
    const start = Date.now();
    while (!messages.some((msg) => msg.type === 'frame') && Date.now() - start < 10000) {
      await new Promise((r) => setTimeout(r, 50));
    }
    
    const hasFrame = messages.some((msg) => msg.type === 'frame');
    console.log(`Frame received: ${hasFrame}`);
    
    if (!hasFrame) {
      throw new Error('No frame received within timeout');
    }

    console.log('Sending click input...');
    ws.send(JSON.stringify({ type: 'input:mouse', action: 'click', x: 50, y: 50, button: 'left' }));

    console.log('Waiting for step creation...');
    const stepStart = Date.now();
    while (!messages.some((msg) => msg.type === 'step:new') && Date.now() - stepStart < 5000) {
      await new Promise((r) => setTimeout(r, 50));
    }
    
    const hasStep = messages.some((msg) => msg.type === 'step:new');
    console.log(`Step created: ${hasStep}`);
    
    ws.close();

    if (hasStep) {
      console.log('✅ TEST PASSED: Step was created');
      return true;
    } else {
      console.log('❌ TEST FAILED: Step was not created (input ignored)');
      return false;
    }

  } catch (error) {
    console.error('❌ TEST ERROR:', error);
    return false;
  }
}

testInputIgnored().then(success => {
  process.exit(success ? 0 : 1);
});