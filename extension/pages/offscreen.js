// Document hors écran : crée les URL blob dont chrome.downloads a besoin pour enregistrer
// l'export du marché (un service worker ne peut pas en créer).
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!msg || msg.target !== "offscreen") return;
  if (msg.type === "blobUrl") reply(URL.createObjectURL(new Blob([msg.text], { type: "application/json" })));
  if (msg.type === "revoke") {
    URL.revokeObjectURL(msg.url);
    reply(true);
  }
});
