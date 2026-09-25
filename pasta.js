(function(){
"use strict";
const gCO2ParKwh = 60; // ajuster selon mix électrique local (France ~60g, moyenne UE ~250g)
let sessionWh = 0, sessionEur = 0;
let endTimestamp = null, audioCtx = null;
// Ajoutez cette ligne sous vos variables globales existantes :
let phaseCuisson = "active"; // "active" ou "passive"

const configPates = {
    fines:     { ratio: 0.9, sel: 5, offset: 3, wh: 150 },      
    epaisses:  { ratio: 0.9, sel: 5, offset: 4, wh: 165 },   
    completes: { ratio: 0.9, sel: 5, offset: 6, wh: 180 }
};

const configGrains = {
    riz_blanc:    { ratio: 0.18, sel: 6, ebullition: 2,  repos: 12, wh: 150, prep: "Rincer 3 fois à l'eau froide pour enlever l'amidon libre.", methode: "Mettre le riz et l'eau froide ensemble. Porter à ébullition avec couvercle." },
    riz_complet:  { ratio: 0.30, sel: 6, ebullition: 5,  repos: 40, wh: 300, prep: "Rincer abondamment à l'eau courante.", methode: "Mettre le riz et l'eau froide ensemble. Porter à ébullition soutenue avec couvercle." },
    quinoa:       { ratio: 0.28, sel: 5, ebullition: 12, repos: 5,  wh: 120, prep: "Rincer longuement pour éliminer la saponine amère.", methode: "Porter l'eau seule à ébullition (100°C). Jeter le quinoa." },
    boulgour:     { ratio: 0.30, sel: 5, ebullition: 0,  repos: 12, wh: 110, prep: "Aucun conditionnement requis.", methode: "Porter l'eau seule à ébullition (100°C). Jeter le boulgour." },
    ble_grain:    { ratio: 0.35, sel: 6, ebullition: 45, repos: 15, wh: 220, prep: "Aucun conditionnement requis. Un trempage de 8h améliore le résultat.", methode: "Mettre le blé et l'eau froide ensemble. Porter à ébullition avec couvercle." }
};

let sec = 0, active = false, inter = null, wakeLock = null;


function calculer() {
    const cat = document.getElementById('pw-category').value;
    const poids = Math.max(0, parseFloat(document.getElementById('pw-poids').value) || 0);
    const cass = document.getElementById('pw-casserole').value;
    const alt = parseInt(document.getElementById('pw-altitude').value);
    const tarifKwh = parseFloat(document.getElementById('pw-tarifKwh').value) || 0.25;
    const stepList = document.getElementById('pw-prepSteps');

    let volEau = 0; let poidsSel = 0; let tMinutes = 0; let whSaved = 0;
    let extraBoil = alt === 1000 ? 1 : (alt === 2000 ? 2 : 0);
    stepList.innerHTML = "";

       if (cat === 'pates') {
        const forme = document.getElementById('pw-formePates').value;
        const tPaquet = parseInt(document.getElementById('pw-tempsPaquet').value) || 0;
        const item = configPates[forme];
        volEau = (poids / 100) * item.ratio;
        poidsSel = Math.round(volEau * item.sel);
        
        // MODIFICATION : Séparation des deux phases de temps en minutes
        let tActive = extraBoil; // Ex: 0, 1 ou 2 minutes selon l'altitude
        let tPassive = Math.max(1, tPaquet + item.offset + (cass === 'legere' ? 1 : 0) - extraBoil);
        
        whSaved = Math.round(item.wh * (poids / 200)) - (extraBoil * 15);
        stepList.innerHTML += `<li>Mettre ${volEau.toFixed(2)}L d'eau and ${poidsSel}g de sel dans la casserole.</li>`;
        stepList.innerHTML += `<li>Porter à ébullition franche (100°C).</li>`;
        
        // Stockage des temps en secondes dans le HTML pour la fonction toggle()
        document.getElementById('pw-disp').dataset.tActive = tActive * 60;
        document.getElementById('pw-disp').dataset.tPassive = tPassive * 60;

        if (extraBoil > 0) {
            stepList.innerHTML += `<li>Jeter les pâtes. ⚠️ Altitude : <strong>Laisser bouillir activement ${extraBoil} minute(s)</strong> avant de couper le feu.</li>`;
        } else {
            stepList.innerHTML += `<li>Jeter les pâtes, remuer 30 secondes pour bloquer l'amidon en surface.</li>`;
        }
        stepList.innerHTML += `<li>Mettez impérativement un <strong>COUVERCLE hermétique</strong> and <strong>COUPEZ LE FEU</strong>.</li>`;
    } else {
        // Gestion dynamique de toutes les autres catégories (riz, céréales, grains...)
        const grain = cat === 'riz'
            ? document.getElementById('pw-typeRiz').value
            : document.getElementById('pw-typeCereale').value;
        const item = configGrains[grain];
        
        volEau = (poids / 100) * item.ratio;
        poidsSel = Math.round(volEau * item.sel);
        whSaved = Math.round(item.wh * (poids / 200)) - (extraBoil * 15);
        
        // MODIFICATION : Séparation des deux phases de temps en minutes
        let tActive = item.ebullition + extraBoil;
        let tPassive = item.repos + (cass === 'legere' ? 1 : 0);
        
        // Stockage des temps en secondes dans le HTML pour la fonction toggle()
        document.getElementById('pw-disp').dataset.tActive = tActive * 60;
        document.getElementById('pw-disp').dataset.tPassive = tPassive * 60;
        
        stepList.innerHTML += `<li><strong>Préparation :</strong> ${item.prep}</li>`;
        stepList.innerHTML += `<li>${item.methode} (Eau : ${volEau.toFixed(2)}L, Sel : ${poidsSel}g).</li>`;
        
        if (tActive > 0) {
            stepList.innerHTML += `<li>Laisser bouillir sur l'induction pendant exactement <strong>${tActive} minutes</strong> sous couvercle.</li>`;
        } else {
            stepList.innerHTML += `<li>Dès l'ébullition de l'eau atteinte, jeter le grain.</li>`;
        }
        stepList.innerHTML += `<li><strong>COUPEZ LE FEU</strong>, gardez le couvercle fermé. Le grain va absorber l'eau.</li>`;
    }
    
    // Mise à jour de l'affichage des constantes d'économie et d'eau
    document.getElementById('pw-eau').innerText = volEau.toFixed(2);
    document.getElementById('pw-sel').innerText = poidsSel;
    document.getElementById('pw-ecoWh').innerText = Math.max(0, whSaved);
    document.getElementById('pw-ecoEur').innerText = (Math.max(0, whSaved) * (tarifKwh / 1000)).toFixed(2);
    
    // Initialisation automatique du premier décompte si la cuisson n'est pas déjà démarrée
    if (!active) {
        let actSec = parseInt(document.getElementById('pw-disp').dataset.tActive) || 0;
        let pasSec = parseInt(document.getElementById('pw-disp').dataset.tPassive) || 0;
        
        // S'il y a un temps actif (ébullition), on commence par lui, sinon on passe directement au passif
        sec = actSec > 0 ? actSec : pasSec;
        phaseCuisson = actSec > 0 ? "active" : "passive";
        showTime();
    }

}

async function requestWakeLock() {
    try { 
        if ('wakeLock' in navigator) {
            // Spécifier explicitement la cible d'extinction (l'écran)
            wakeLock = await navigator.wakeLock.request('screen'); 
        } 
    } catch (err) {}
}

function releaseWakeLock() {
    if (wakeLock !== null) { wakeLock.release(); wakeLock = null; }
}
function toggleInputs() {
    const cat = document.getElementById('pw-category').value;
    document.getElementById('pw-pates-options').style.display = (cat === 'pates') ? 'block' : 'none';
    document.getElementById('pw-riz-options').style.display = (cat === 'riz') ? 'block' : 'none';
    document.getElementById('pw-cereales-options').style.display = (cat === 'cereales') ? 'block' : 'none';

    active = false;
    clearInterval(inter);
    releaseWakeLock();
    document.getElementById('pw-btn').innerText = "Lancer la cuisson passive";
    document.getElementById('pw-btn').style.background = "var(--green)";
    calculer();
}
function showTime() {
    const m = Math.floor(sec/60).toString().padStart(2,'0');
    const s = (sec%60).toString().padStart(2,'0');
    document.getElementById('pw-disp').innerText = `${m}:${s}`;
}

function tick() {
    const remaining = Math.round((endTimestamp - Date.now()) / 1000);
    sec = Math.max(0, remaining);
    showTime();
    
    if (remaining <= 0) {
        if (phaseCuisson === "active") {
            // TRANSITION : La phase active est finie, on passe à la phase passive
            phaseCuisson = "passive";
            localStorage.setItem('pastawatts_phase', phaseCuisson);
            
            sec = parseInt(document.getElementById('pw-disp').dataset.tPassive) || 0;
            endTimestamp = Date.now() + sec * 1000;
            localStorage.setItem('pastawatts_end', endTimestamp);
            
            const b = document.getElementById('pw-btn');
            b.innerText = "CUISSON PASSIVE (Hors du feu)...";
            
            // Alerte sonore rapide pour dire de couper le feu
            AlerteIntermediaire(); 
        } else {
            // FIN FINALE : La phase passive est terminée
            clearInterval(inter); active = false;
            const b = document.getElementById('pw-btn');
            b.innerText = "Terminé !"; b.style.background = "#34495e";
            releaseWakeLock();
            localStorage.removeItem('pastawatts_end');
            localStorage.removeItem('pastawatts_phase');
            
            const co2 = sessionWh * gCO2ParKwh / 1000;
            const totals = JSON.parse(localStorage.getItem('pastawatts_totals') || '{"wh":0,"eur":0,"co2":0}');
            totals.wh += sessionWh; totals.eur += sessionEur; totals.co2 += co2;
            localStorage.setItem('pastawatts_totals', JSON.stringify(totals));
            displayTotals(totals);
            declencherAlerteVocale();
        }
    }
}

// Petite fonction audio d'aide à ajouter pour la transition
function AlerteIntermediaire() {
    try {
        if ('speechSynthesis' in window) {
            const msg = new SpeechSynthesisUtterance("Ébullition terminée. Coupez le feu et mettez le couvercle.");
            msg.lang = 'fr-FR'; window.speechSynthesis.speak(msg);
        }
    } catch(e){}
}

function demanderPermissionNotifications() {
    if ('Notification' in window) {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                console.log("Notifications autorisées !");
            }
        });
    }
}
function toggle() {
    demanderPermissionNotifications();
    const b = document.getElementById('pw-btn');
    if (active) {
        clearInterval(inter); active = false;
        b.innerText = "Reprendre la cuisson"; b.style.background = "var(--green)";
        releaseWakeLock();
        localStorage.removeItem('pastawatts_end');
        localStorage.removeItem('pastawatts_phase');
    } else {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
        }
        active = true;
        
        let actSec = parseInt(document.getElementById('pw-disp').dataset.tActive) || 0;
        // Si aucun temps actif (altitude 0), on commence directement en passif
        if (sec === 0 || (!localStorage.getItem('pastawatts_end') && actSec === 0)) {
            phaseCuisson = "passive";
            sec = parseInt(document.getElementById('pw-disp').dataset.tPassive) || 0;
        }
        
        b.innerText = phaseCuisson === "active" ? "ÉBULLITION ACTIVE..." : "CUISSON PASSIVE (Hors du feu)...";
        b.style.background = "var(--red)";
        requestWakeLock();
        
        sessionWh = parseFloat(document.getElementById('pw-ecoWh').innerText) || 0;
        sessionEur = parseFloat(document.getElementById('pw-ecoEur').innerText) || 0;
        
        endTimestamp = Date.now() + sec * 1000;
        localStorage.setItem('pastawatts_end', endTimestamp);
        localStorage.setItem('pastawatts_phase', phaseCuisson);
        
        clearInterval(inter);
        inter = setInterval(tick, 1000);
    }
}


function declencherAlerteVocale() {
    const cat = document.getElementById('pw-category').value;
    let nomAliment = "votre préparation";
    if (cat === 'pates') nomAliment = "les pâtes";
    else if (cat === 'riz') nomAliment = "le riz";
    else nomAliment = "les céréales";

    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.6, audioCtx.currentTime);
        oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.4);
    } catch(e) {}

    setTimeout(() => {
        if ('speechSynthesis' in window) {
            const message = new SpeechSynthesisUtterance(`Attention, la cuisson passive pour ${nomAliment} est terminée. Veuillez égoutter ou servir immédiatement.`);
            message.lang = 'fr-FR'; window.speechSynthesis.speak(message);
        } else {
            alert(`⏰ Cuisson passive terminée pour ${nomAliment} !`);
        }
        calculer();
    }, 500);
}
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        if (active && wakeLock === null) {
            await requestWakeLock();
        }
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'ANNULER_ALERTE' });
        }
        
        // Rattrapage à la réouverture (gère si les deux phases ont expiré en tâche de fond)
        const savedEnd = localStorage.getItem('pastawatts_end');
        const savedPhase = localStorage.getItem('pastawatts_phase');
        if (savedEnd && savedPhase) {
            phaseCuisson = savedPhase;
            endTimestamp = parseInt(savedEnd, 10);
            let remaining = Math.round((endTimestamp - Date.now()) / 1000);
            
            if (remaining <= 0 && active) {
                // Si la phase active a expiré en arrière-plan, tick() effectuera la bascule ou la fin
                tick();
            }
        }
    } 
    else if (document.visibilityState === 'hidden' && active) {
        const savedEnd = localStorage.getItem('pastawatts_end');
        if (savedEnd && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
            const tempsActifRestantMs = parseInt(savedEnd, 10) - Date.now();
            const cat = document.getElementById('pw-category').value;
            let nomAliment = cat === 'pates' ? 'vos pâtes' : (cat === 'riz' ? 'votre riz' : 'vos céréales');

            if (tempsActifRestantMs > 0) {
                let alertes = [];

                if (phaseCuisson === "active") {
                    alertes.push({
                        delaiMs: tempsActifRestantMs,
                        titre: "⚠️ COUPEZ LE FEU !",
                        message: `L'ébullition active est finie pour ${nomAliment}. Coupez le feu et mettez le couvercle.`
                    });
                    const tPassiveSec = parseInt(document.getElementById('pw-disp').dataset.tPassive) || 0;
                    alertes.push({
                        delaiMs: tempsActifRestantMs + (tPassiveSec * 1000),
                        titre: "⏰ Cuisson Terminée !",
                        message: `La cuisson passive est terminée pour ${nomAliment}. Servez ou égouttez.`
                    });
                } else {
                    alertes.push({
                        delaiMs: tempsActifRestantMs,
                        titre: "⏰ Cuisson Terminée !",
                        message: `La cuisson passive est terminée pour ${nomAliment}. Servez ou égouttez.`
                    });
                }

                navigator.serviceWorker.controller.postMessage({
                    type: 'PROGRAMMER_ALERTES',
                    alertes: alertes
                });
            }
        }
    }
});

function displayTotals(totals) {
    totals = totals || JSON.parse(localStorage.getItem('pastawatts_totals') || '{"wh":0,"eur":0,"co2":0}');
    document.getElementById('pw-totalWh').innerText = Math.round(totals.wh);
    document.getElementById('pw-totalEur').innerText = totals.eur.toFixed(2);
    document.getElementById('pw-totalCo2').innerText = Math.round(totals.co2);
}
function resetTotals() {
    if (confirm("Réinitialiser le cumul des économies ?")) {
        localStorage.removeItem('pastawatts_totals');
        displayTotals();
    }
}
window.addEventListener('load', () => {
    displayTotals();
    calculer();
    document.getElementById('pw-disp').innerText = "00:00";   // ← AJOUT
    
    // 1. Enregistrement du Service Worker (sw.js)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker enregistré avec succès !', reg.scope))
            .catch(err => console.error('Échec de l\'enregistrement du Service Worker :', err));
    }
    
    // 3. Reprise d'un minuteur existant en arrière-plan / stockage local
    const savedEnd = localStorage.getItem('pastawatts_end');
    const savedPhase = localStorage.getItem('pastawatts_phase');
    const b = document.getElementById('pw-btn');
    
    if (savedEnd) {
        endTimestamp = parseInt(savedEnd, 10);
        phaseCuisson = savedPhase || "passive";
        const remaining = Math.round((endTimestamp - Date.now()) / 1000);
        
        if (remaining > 0) {
            sec = remaining; 
            showTime();
            active = true;
            b.innerText = phaseCuisson === "active" ? "ÉBULLITION ACTIVE..." : "CUISSON PASSIVE (Hors du feu)..."; 
            b.style.background = "var(--red)";
            requestWakeLock();
            clearInterval(inter);
            inter = setInterval(tick, 1000);
        } else {
            // Nettoyage si le temps est expiré
            localStorage.removeItem('pastawatts_end');
            localStorage.removeItem('pastawatts_phase');
            b.innerText = "Lancer la cuisson passive";
            b.style.background = "var(--green)";
        }
    } else {
        // État par défaut si aucune cuisson n'est enregistrée
        b.innerText = "Lancer la cuisson passive";
        b.style.background = "var(--green)";
    }
};


window.Pasta = { calculer, toggle, toggleInputs, resetTotals };
})();
