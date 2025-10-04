import React, { useCallback, useState } from 'react';

export function FileDropZone({ onFiles, accept, multiple=false, children }){
  const [hover,setHover] = useState(false);
  const onDragOver = e=>{ e.preventDefault(); setHover(true); };
  const onDragLeave = e=>{ e.preventDefault(); setHover(false); };
  const onDrop = e=>{ e.preventDefault(); setHover(false); const files=Array.from(e.dataTransfer.files||[]); if(!multiple) onFiles(files.slice(0,1)); else onFiles(files); };
  const style={ border:'2px dashed var(--border)', padding:20, borderRadius:10, textAlign:'center', background:hover?'var(--bg-alt)':'transparent', cursor:'pointer', fontSize:12 };
  return <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} style={style}>
    {children || 'Trascina file qui'}
    <div style={{marginTop:6,opacity:.5}}>{accept}</div>
  </div>;
}
export default FileDropZone;
