import React from 'react';
export function ProgressBar({ value, max=100, height=6, color='linear-gradient(90deg,#6366f1,#8b5cf6)' }){
  const pct = max ? Math.min(100, (value/max)*100) : 0;
  return <div style={{height,background:'var(--bg-muted)',borderRadius:4,overflow:'hidden'}}><div style={{height:'100%',width:pct+'%',background:color,transition:'width .25s'}} /></div>;
}
export default ProgressBar;
