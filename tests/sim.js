const E=require('../js/engine.js'), AI=require('../js/ai.js');
let ot=0, fails=0, types={};
for(let g=0;g<3000;g++){
  const s=E.newGame({home:'BC',away:'CGY',ctrl:['cpu','cpu']}); E.coinToss(s);
  let n=0;
  while(s.phase!=='final'){ const r=E.act(s,AI.decide(s).id); if(r.score) types[r.score.type]=(types[r.score.type]||0)+1; if(++n>2000) throw 'loop'; }
  if(s.ot) ot++;
  for(const t of [0,1]){
    const st=s.stats[t], sum=s.playYards[t].reduce((a,b)=>a+b,0);
    if(sum!==st.yards||st.passYds+st.rushYds!==st.yards) fails++;
    if(st.pts.reduce((a,b)=>a+b,0)!==s.score[t]) fails++;
  }
  if(s.score[0]===s.score[1]) fails++;
}
console.log({ot,fails,types});
