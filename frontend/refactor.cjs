const fs = require('fs');
const path = require('path');

const basePath = '/home/linux/Documents/mathscript/frontend';

function refactorFile(file) {
    const fullPath = path.join(basePath, file);
    if (!fs.existsSync(fullPath)) return;
    let content = fs.readFileSync(fullPath, 'utf8');

    // Replace '/assets/...' with `${process.env.REACT_APP_ASSETS_BASE_URL}...`
    content = content.replace(/'\/assets\/(.*?)'/g, "`\\${process.env.REACT_APP_ASSETS_BASE_URL}$1`");
    
    // Replace "/assets/..." with `${process.env.REACT_APP_ASSETS_BASE_URL}...` inside JSX attributes
    content = content.replace(/="\/assets\/(.*?)"/g, "={`\\${process.env.REACT_APP_ASSETS_BASE_URL}$1`}");

    fs.writeFileSync(fullPath, content, 'utf8');
}

['src/pages/GamePlayerPage.jsx', 'src/game/IsoTycoonScene.js', 'src/game/PlayScene.js'].forEach(refactorFile);
console.log('Refactoring done.');