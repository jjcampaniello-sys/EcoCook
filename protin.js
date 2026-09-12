(function(){
"use strict";
const gCO2ParKwh = 60; // Mix électrique français moyen (~60g/kWh)
let sessionWh = 0, sessionEur = 0;
let endTimestamp = null, audioCtx = null;
let sec = 0, active = false, inter = null, wakeLock = null;

const configOeufs = {
    coque:  { baseMin: 6.5 },
    mollet: { baseMin: 8.5 },
    dur:    { baseMin: 12.0 }
};

const calibresOeufs = { S: 50, M: 60, L: 68, XL: 75 };
const rendementMicroonde = 0.65; // efficacité électrique réelle d'un magnétron domestique (~65%), le reste part en pertes thermiques

function toggleInputs() {
    const cat = document.getElementById('pi-category').value;
    
    document.getElementById('pi-oeufs-options').style.display = (cat === 'oeufs') ? 'block' : 'none';
    document.getElementById('pi-viandes-options').style.display = (cat === 'viandes') ? 'block' : 'none';
    document.getElementById('pi-poissons-options').style.display = (cat === 'poissons') ? 'block' : 'none';

    const labelPoids = document.getElementById('pi-labelPoids');
    const inputPoids = document.getElementById('pi-poids');

    if (cat === 'oeufs') {
        labelPoids.innerText = "Nombre d'œufs :";
        if (inputPoids.value > 12) inputPoids.value = 2;
    } else {
        if (cat === 'poissons') {
            labelPoids.innerText = "Masse du poisson / crustacés (grammes) :";
        } else {
            labelPoids.innerText = "Masse de la viande (grammes) :";
        }
        if (inputPoids.value < 10) inputPoids.value = 200;
    }

    resetTimerState();
    calculer();
}

function calculer() {
    const cat = document.getElementById('pi-category').value;
    const quantite = Math.max(1, parseFloat(document.getElementById('pi-poids').value) || 1);
    const cass = document.getElementById('pi-casserole').value;
    const tarifKwh = parseFloat(document.getElementById('pi-tarifKwh').value) || 0.25;
    const stepList = document.getElementById('pi-prepSteps');

    let volEau = 0, tSeconds = 0, whSaved = 0;
    stepList.innerHTML = "";
    document.getElementById('pi-infoEau').style.display = "block";

    if (cat === 'oeufs') {
        const typeCuisson = document.getElementById('pi-cuissonOeuf').value;
        const calibre = document.getElementById('pi-tailleOeuf').value;
        const nbOeufs = Math.round(quantite);

        volEau = Math.min(1.2, 0.15 + (nbOeufs * 0.08));

        let baseTime = configOeufs[typeCuisson].baseMin * 60;
        let pRef = 60;
        let pReel = calibresOeufs[calibre];
        
        let coefPoids = Math.pow(pReel / pRef, 2/3);

        tSeconds = Math.round(baseTime * coefPoids);
        if (cass === 'legere') tSeconds += 20;

        whSaved = Math.round(180 + (nbOeufs * 5));

        stepList.innerHTML += `<li>Mettre seulement <strong>${volEau.toFixed(2)}L d'eau</strong> afin de recouvrir les œuf(s).</li>`;
        stepList.innerHTML += `<li>Porter à ébullition rapide sous couvercle.</li>`;
        stepList.innerHTML += `<li>Plonger les ${nbOeufs} œuf(s) et maintenir le feu <strong>1 minutes</strong>.</li>`;
        stepList.innerHTML += `<li><strong>COUPEZ LE FEU</strong>, fermez avec un couvercle hermétique (cuisson étouffée/vapeur).</li>`;
        stepList.innerHTML += `<li>À la fin du temps, plongez les œufs dans l'eau froide pour stopper la cuisson.</li>`;

    } else if (cat === 'viandes') {
        const typeViande = document.getElementById('pi-typeViande').value;
        const cuisson = document.getElementById('pi-cuissonViande').value;
        const methode = document.getElementById('pi-methodeViande').value;

        if (methode === 'poele') {
            document.getElementById('pi-infoEau').style.display = "none";
            
            let tempsSec = (quantite / 100) * (typeViande === 'volaille' || typeViande === 'porc' ? 180 : 130);
            if (cuisson === 'biencuit') tempsSec *= 1.35;
            
            tSeconds = Math.round(tempsSec);
            whSaved = 110;

            stepList.innerHTML += `<li>Chauffer la poêle antiadhésive à sec à feu moyen (sans huile/beurre).</li>`;
            stepList.innerHTML += `<li>Saisir la viande 1 minute de chaque côté pour former la croûte protectrice.</li>`;
            stepList.innerHTML += `<li><strong>COUPEZ LE FEU</strong> et couvrez immédiatement avec un couvercle étanche.</li>`;
            stepList.innerHTML += `<li>La cuisson se termine doucement grâce à la vapeur et la chaleur résiduelle.</li>`;

        } else if (methode === 'sauce') {
            volEau = (quantite / 1000) * 0.45;
            
            let tempsSec = (quantite / 1000) * 2400;
            if (typeViande === 'boeuf' || typeViande === 'gibier') tempsSec *= 1.25;
            
            tSeconds = Math.round(tempsSec);
            whSaved = 420;

            stepList.innerHTML += `<li>Colorer brièvement la viande et les aromates dans votre cocotte.</li>`;
            stepList.innerHTML += `<li>Mouiller avec ~${volEau.toFixed(2)}L de liquide (bouillon/vin).</li>`;
            stepList.innerHTML += `<li>Porter à forte ébullition pendant 8 à 10 minutes sous couvercle.</li>`;
            stepList.innerHTML += `<li><strong>COUPEZ LE FEU</strong>. La masse thermique de la cocotte assure le mijotage passif.</li>`;

        } else if (methode === 'microonde') {
            document.getElementById('pi-infoEau').style.display = "none";
            
            let tempsSec = (quantite / 100) * 75;
            if (typeViande === 'volaille') tempsSec *= 0.85;
            
            tSeconds = Math.round(tempsSec);
            whSaved = Math.round(150 * rendementMicroonde);

            stepList.innerHTML += `<li>Disposer la viande dans un plat adapté avec 1 cuillère à soupe d'eau au fond.</li>`;
            stepList.innerHTML += `<li>Couvrir avec une cloche ou un film étirable perforé.</li>`;
            stepList.innerHTML += `<li>Cuire à <strong>400W-500W maxi</strong> (température douce préservant les nutriments).</li>`;
            stepList.innerHTML += `<li>Laisser reposer 2 minutes au chaud avant de consommer.</li>`;
        }

    } else if (cat === 'poissons') {
        const typeP = document.getElementById('pi-typePoisson').value;
        const methodeP = document.getElementById('pi-methodePoisson').value;

        if (methodeP === 'poche') {
            volEau = Math.min(2.0, 0.4 + (quantite / 1000) * 0.8);
            document.getElementById('pi-infoEau').style.display = "block";
            
            let tempsSec = 300;
            if (typeP === 'ferme') tempsSec = 480;
            if (typeP === 'gras') tempsSec = 360;
            if (typeP === 'crustaces') tempsSec = 180;
            tSeconds = tempsSec;
            whSaved = 200;

            stepList.innerHTML += `<li>Porter <strong>${volEau.toFixed(2)}L d'eau</strong> (ou court-bouillon) à ébullition sous couvercle.</li>`;
            stepList.innerHTML += `<li>Plonger le poisson/crustacé délicatement dans l'eau bouillante.</li>`;
            stepList.innerHTML += `<li><strong>COUPEZ LE FEU IMMÉDIATEMENT</strong> et mettez un couvercle étanche.</li>`;
            stepList.innerHTML += `<li>Le poisson poche en douceur sans détruire ses chairs ni assécher la protéine.</li>`;

        } else if (methodeP === 'poele') {
            document.getElementById('pi-infoEau').style.display = "none";
            let tempsSec = (quantite / 100) * 60; 
            if (typeP === 'ferme') tempsSec *= 1.4;
            if (typeP === 'gras') tempsSec *= 1.15;
            if (typeP === 'crustaces') tempsSec = 120;
            tSeconds = Math.round(tempsSec);
            whSaved = 90;

            stepList.innerHTML += `<li>Chauffer la poêle à feu moyen (à sec ou très légèrement huilée).</li>`;
            stepList.innerHTML += `<li>Saisir le poisson 45 secondes côté peau/surface.</li>`;
            stepList.innerHTML += `<li><strong>COUPEZ LE FEU</strong>, mettez un couvercle et laissez la chaleur étouffée finir la cuisson.</li>`;

        } else if (methodeP === 'microonde') {
            document.getElementById('pi-infoEau').style.display = "none";
            let tempsSec = (quantite / 100) * 45;
            if (typeP === 'ferme') tempsSec *= 1.2;
            if (typeP === 'gras') tempsSec *= 1.1;
            if (typeP === 'crustaces') tempsSec = (quantite / 100) * 30;
            tSeconds = Math.round(tempsSec);
            whSaved = Math.round(130 * rendementMicroonde);

            stepList.innerHTML += `<li>Placer le poisson dans un plat couvert avec 1 c. à soupe d'eau ou de citron.</li>`;
            stepList.innerHTML += `<li>Cuire à puissance modérée (<strong>350W-450W</strong> maxi) pour ne pas faire exploser les fibres musculaires.</li>`;
            stepList.innerHTML += `<li>Laisser reposer 1 à 2 minutes sous cloche avant d'ouvrir.</li>`;
        }
    }

    document.getElementById('pi-eau').innerText = volEau.toFixed(2);
    document.getElementById('pi-ecoWh').innerText = Math.max(0, whSaved);
    document.getElementById('pi-ecoEur').innerText = (Math.max(0, whSaved) * (tarifKwh / 1000)).toFixed(2);
    document.getElementById('pi-ecoCo2').innerText = Math.round(Math.max(0, whSaved) * gCO2ParKwh / 1000);

    if (!active) {
        sec = tSeconds;
        showTime();
    }
}
function showTime() {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    document.getElementById('pi-disp').innerText = `${m}:${s}`;
}

function resetTimerState() {
    active = false;
    clearInterval(inter);
    releaseWakeLock();
    const btn = document.getElementById('pi-btn');
    btn.innerText = "Démarrer la cuisson";
    btn.style.background = "var(--primary)";
}

function tick() {
    const remaining = Math.round((endTimestamp - Date.now()) / 1000);
    sec = Math.max(0, remaining);
    showTime();
    
    if (remaining <= 0) {
        clearInterval(inter); 
        active = false;
        const b = document.getElementById('pi-btn');
        b.innerText = "Cuisson Terminée !"; 
        b.style.background = "#34495e";
        
        releaseWakeLock();
        localStorage.removeItem('protin_end');
        
        const co2 = sessionWh * gCO2ParKwh / 1000;
        const totals = JSON.parse(localStorage.getItem('protin_totals') || '{"wh":0,"eur":0,"co2":0}');
        totals.wh += sessionWh; 
        totals.eur += sessionEur; 
        totals.co2 += co2;
        
        localStorage.setItem('protin_totals', JSON.stringify(totals));
        displayTotals(totals);
        declencherAlerteVocale();
    }
}

function toggle() {
    const b = document.getElementById('pi-btn');
    if (active) {
        clearInterval(inter); 
        active = false;
        b.innerText = "Reprendre la cuisson"; 
        b.style.background = "var(--primary)";
        releaseWakeLock();
        localStorage.removeItem('protin_end');
    } else {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
        }
        active = true; 
        b.innerText = "PAUSE (Cuisson en cours...)"; 
        b.style.background = "var(--red)";
        
        requestWakeLock();
        sessionWh = parseFloat(document.getElementById('pi-ecoWh').innerText) || 0;
        sessionEur = parseFloat(document.getElementById('pi-ecoEur').innerText) || 0;
        endTimestamp = Date.now() + sec * 1000;
        localStorage.setItem('protin_end', endTimestamp);
        // AJOUT SÉCURITÉ : Nettoyer l'intervalle avant d'en créer un nouveau
        clearInterval(inter); 
        inter = setInterval(tick, 1000);
    }
}

// ====== 1. DÉFINITION DES FONCTIONS ======
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            // "screen" est requis pour empêcher l'écran de s'éteindre
            wakeLock = await navigator.wakeLock.request('screen');
            
            // Écouteur crucial : si le système coupe le verrou (ex: baisse de batterie),
            // on libère proprement la variable pour éviter les conflits logiques.
            wakeLock.addEventListener('release', () => {
                wakeLock = null;
                console.log("Wake Lock libéré par le système.");
            });
            console.log("Wake Lock activé avec succès.");
        }
    } catch (err) {
        console.error(`Échec du Wake Lock : ${err.message}`);
    }
}

function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release().catch(() => {}); // Demande de relâcher le verrou
        wakeLock = null; // Nettoyage de la variable locale
        console.log("Wake Lock désactivé manuellement.");
    }
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

// ====== 2. GESTION DU CYCLE DE VIE PWA ======
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        if (active && wakeLock === null) {
            await requestWakeLock();
        }
        
        // AJOUT : Annuler l'alerte de notification si l'utilisateur revient sur l'appli
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'ANNULER_ALERTE' });
        }
        
        const savedEnd = localStorage.getItem('protin_end');
        if (savedEnd) {
            const remaining = Math.round((parseInt(savedEnd, 10) - Date.now()) / 1000);
            if (remaining <= 0 && active) {
                sec = 0;
                tick(); 
            }
        }
    } 
    // AJOUT COMPORTEMENT ARRIÈRE-PLAN : 
    else if (document.visibilityState === 'hidden' && active) {
        const savedEnd = localStorage.getItem('protin_end');
        if (savedEnd) {
            const tempsRestantMs = parseInt(savedEnd, 10) - Date.now();
            
            if (tempsRestantMs > 0 && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
                const cat = document.getElementById('pi-category').value;
                let aliment = cat === 'oeufs' ? 'vos œufs' : cat === 'poissons' ? 'votre poisson' : cat === 'viande' ? 'votre viande';
                
                navigator.serviceWorker.controller.postMessage({
                    type: 'PROGRAMMER_ALERTE',
                    delaiMs: tempsRestantMs,
                    titre: '⏰ Cuisson Terminée (EffiProt) !',
                    message: `Le temps est écoulé pour ${aliment}. Retirez-les du feu.`
                });
            }
        }
    }
});


function declencherAlerteVocale() {
    const cat = document.getElementById('pi-category').value;
    let nomAliment = "votre préparation";
    if (cat === 'oeufs') nomAliment = "les œufs";
    else if (cat === 'viandes') nomAliment = "la viande";
    else if (cat === 'poissons') nomAliment = "le poisson";

    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
        oscillator.start(); 
        oscillator.stop(audioCtx.currentTime + 0.5);
    } catch(e) {}

    setTimeout(() => {
        if ('speechSynthesis' in window) {
            const message = new SpeechSynthesisUtterance(`La cuisson optimale pour ${nomAliment} est terminée. Récupérez votre préparation.`);
            message.lang = 'fr-FR'; 
            window.speechSynthesis.speak(message);
        } else {
            alert(`⏰ Cuisson terminée pour ${nomAliment} !`);
        }
        calculer();
    }, 500);
}


function displayTotals(totals) {
    totals = totals || JSON.parse(localStorage.getItem('protin_totals') || '{"wh":0,"eur":0,"co2":0}');
    document.getElementById('pi-totalWh').innerText = Math.round(totals.wh);
    document.getElementById('pi-totalEur').innerText = totals.eur.toFixed(2);
    document.getElementById('pi-totalCo2').innerText = Math.round(totals.co2);
}

function resetTotals() {
    if (confirm("Réinitialiser l'historique d'économies ?")) {
        localStorage.removeItem('protin_totals');
        displayTotals();
    }
}

window.onload = () => {
    displayTotals();
    calculer();
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker enregistré avec succès !', reg.scope))
            .catch(err => console.error('Échec de l\'enregistrement du Service Worker :', err));
    }

    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                console.log('Notifications système autorisées par l\'utilisateur.');
            }
        });
    }

    const savedEnd = localStorage.getItem('protin_end');
    if (savedEnd) {
        endTimestamp = parseInt(savedEnd, 10);
        const remaining = Math.round((endTimestamp - Date.now()) / 1000);
        if (remaining > 0) {
            sec = remaining; 
            showTime();
            active = true;
            const b = document.getElementById('pi-btn');
            b.innerText = "PAUSE (Cuisson en cours...)"; 
            b.style.background = "var(--red)";
            requestWakeLock();
            clearInterval(inter);
            inter = setInterval(tick, 1000);
        } else {
            localStorage.removeItem('protin_end');
        }
    }
};


window.Protin = { calculer, toggle, toggleInputs, resetTotals };
})();
