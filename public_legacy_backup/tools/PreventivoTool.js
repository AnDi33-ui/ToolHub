// PreventivoTool.js
// Wrapper italiano del generatore di preventivi che re-usa la logica di QuoteTool.
// Mantiene coerenza con gli alias (?tool=preventivo / preventivi) offrendo un entry point esplicito.

(function(){
  if(!window.QuoteTool){
    console.warn('[PreventivoTool] QuoteTool non ancora definito: assicurarsi che QuoteTool.js sia caricato prima.');
  }
  function PreventivoTool(props){
    // Possibile spazio per piccole differenze localizzate (es: testo titolo). Per ora ri-usa QuoteTool.
    return React.createElement(window.QuoteTool, props);
  }
  window.PreventivoTool = PreventivoTool;
})();
