require('dotenv').config();

async function run() {
  const res = await fetch('http://localhost:1235/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'local-model',
      messages: [{ role: 'user', content: '/nothink\n\nSay exactly this JSON and nothing else:\n{"quotes":[{"name":"Sen. Chuck Schumer","party":"D","state":"NY","text":"They cut Medicaid by 800 billion dollars.","billId":null,"stance":"oppose"}]}' }],
      temperature: 0.1,
      max_tokens: 600,
      stream: false
    })
  });
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  console.log('content:', JSON.stringify(content));
  console.log('reasoning_tokens:', data.usage?.completion_tokens_details?.reasoning_tokens);
  console.log('finish_reason:', data.choices?.[0]?.finish_reason);
}
run().catch(console.error);
