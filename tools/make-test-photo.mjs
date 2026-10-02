// Erzeugt ein synthetisches Schachtfoto (Draufsicht) für Tests und Screenshots.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [execSync('npm root -g').toString().trim()] }));
const out = process.argv[2] || 'test-schacht.jpg';
const html = `<canvas id=c width=1600 height=1200></canvas><script>
const c=document.getElementById('c'),g=c.getContext('2d');const W=1600,H=1200,cx=800,cy=610;
g.fillStyle='#2b2b2b';g.fillRect(0,0,W,H);
// Asphalt
for(let i=0;i<9000;i++){g.fillStyle='rgba('+(60+Math.random()*50)+','+(60+Math.random()*50)+','+(60+Math.random()*50)+',.5)';g.fillRect(Math.random()*W,Math.random()*H,3,3);}
// Rahmen
g.beginPath();g.arc(cx,cy,520,0,7);g.fillStyle='#4a4038';g.fill();
g.beginPath();g.arc(cx,cy,470,0,7);g.fillStyle='#57534e';g.fill();
// Konus/Wand mit Verlauf (Perspektive nach unten)
const grad=g.createRadialGradient(cx,cy+20,120,cx,cy,470);grad.addColorStop(0,'#1c1917');grad.addColorStop(.55,'#78716c');grad.addColorStop(1,'#a8a29e');
g.beginPath();g.arc(cx,cy,465,0,7);g.fillStyle=grad;g.fill();
// Ringfugen
for(const r of [430,380,330,285]){g.beginPath();g.arc(cx,cy+(470-r)*0.04,r,0,7);g.strokeStyle='rgba(30,25,20,.55)';g.lineWidth=4;g.stroke();}
// Sohle/Auftritt
g.beginPath();g.arc(cx,cy+18,250,0,7);g.fillStyle='#8f8a82';g.fill();
// Gerinne von 6 nach 12 Uhr
g.fillStyle='#3f4a4f';g.fillRect(cx-55,cy-230,110,480);
g.fillStyle='rgba(90,120,130,.8)';g.fillRect(cx-35,cy-230,70,480);
// Rohröffnungen: Auslauf 12, Zulauf 6, Zulauf 9 (kleiner)
function pipe(x,y,rx,ry){g.beginPath();g.ellipse(x,y,rx,ry,0,0,7);g.fillStyle='#0b0b0b';g.fill();g.strokeStyle='#b9b3a8';g.lineWidth=8;g.stroke();}
pipe(cx,cy-238,70,40);pipe(cx,cy+262,70,40);pipe(cx-262,cy+12,30,48);
// Steigeisen
for(let i=0;i<6;i++){g.fillStyle='#d97706';g.fillRect(cx+300-i*12,cy-200+i*65,60-i*6,10);}
// Riss bei 3 Uhr
g.strokeStyle='#1c1917';g.lineWidth=4;g.beginPath();g.moveTo(cx+420,cy-60);g.lineTo(cx+380,cy-20);g.lineTo(cx+400,cy+30);g.lineTo(cx+360,cy+80);g.stroke();
// Feuchte Stelle bei 9-10 Uhr
g.fillStyle='rgba(40,50,60,.45)';g.beginPath();g.ellipse(cx-360,cy-140,60,90,0.5,0,7);g.fill();
</script>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
await page.setContent(html);
await page.locator('#c').screenshot({ path: out, type: 'jpeg', quality: 88 });
await browser.close();
console.log('ok', out);
