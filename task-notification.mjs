const response = await fetch(process.env.DISCORD_WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'Task Assistant',
    embeds: [{
      title: '✅ Task Completed: UI Refinements from Reference Design',
      description: 'Successfully brought over PlaybackControls design and StepInsertionPoint component',
      color: 0x3498db,
      fields: [
        { name: '📁 Task 8.1', value: 'Updated ReplayControls.tsx with glassmorphism styling (no speed selector)' },
        { name: '📁 Task 8.2', value: 'Created StepInsertionPoint.tsx and integrated into StepsList.tsx' },
        { name: '📋 Verification', value: 'Typecheck and lint passing ✅', inline: true },
        { name: '🎨 UI Changes', value: 'Modern orange/cream theme with smooth animations', inline: true }
      ],
      footer: { text: 'Task Assistant • Completed at' },
      timestamp: new Date().toISOString()
    }]
  })
});

if (response.ok || response.status === 204) {
  console.log('✅ Notification sent successfully!');
} else {
  console.error('❌ Failed to send notification:', response.status, response.statusText);
}
