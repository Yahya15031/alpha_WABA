const fs = require('fs');
const path = 'frontend/src/app/App.tsx';
const s = fs.readFileSync(path,'utf8');
const stack = [];
const lines = s.split(/\r?\n/);
for(let i=0;i<s.length;i++){
  const ch = s[i];
  if(ch === '{') stack.push(i);
  else if(ch === '}') stack.pop();
}
console.log('unmatched count:', stack.length);
if(stack.length){
  const pos = stack[stack.length-1];
  const line = s.slice(0,pos).split(/\r?\n/).length;
  console.log('last unmatched at index',pos,'line',line);
  console.log('line content:', lines[line-1]);
}
else console.log('all matched');
