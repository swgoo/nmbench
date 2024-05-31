"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const util = __importStar(require("util"));
const childProcess = __importStar(require("child_process"));
const commands_1 = require("./commands");
const readFile = util.promisify(fs.readFile);
class ModFileViewerProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    refresh(element) {
        this._onDidChangeTreeData.fire(element);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return Promise.resolve([]);
            }
            return Promise.resolve(workspaceFolders.map(folder => new ModFolder(folder.uri)));
        }
        else if (element instanceof ModFolder) {
            return new Promise(resolve => {
                fs.readdir(element.uri.fsPath, (err, files) => {
                    if (err) {
                        resolve([]);
                    }
                    else {
                        const folders = [];
                        const modFiles = [];
                        files.forEach(file => {
                            const filePath = path.join(element.uri.fsPath, file);
                            const stat = fs.statSync(filePath);
                            if (stat.isDirectory()) {
                                folders.push(new ModFolder(vscode.Uri.file(filePath)));
                            }
                            else if (file.match(/\.(mod|ctl)$/)) {
                                modFiles.push(new ModFile(vscode.Uri.file(filePath)));
                            }
                        });
                        resolve([...folders, ...modFiles]);
                    }
                });
            });
        }
        else {
            return Promise.resolve([]);
        }
    }
}
class ModFile extends vscode.TreeItem {
    uri;
    constructor(uri) {
        super(path.basename(uri.fsPath));
        this.uri = uri;
        const fileContent = fs.readFileSync(uri.fsPath, 'utf-8');
        this.tooltip = this.extractDescription(fileContent) || uri.fsPath;
        this.contextValue = 'modFile';
    }
    extractDescription(content) {
        const descriptionRegex = /.*Description:\s*(.*)/i; // 'i' flag for case-insensitive match
        const match = content.match(descriptionRegex);
        return match ? match[1] : null;
    }
}
class ModFolder extends vscode.TreeItem {
    uri;
    constructor(uri) {
        super(path.basename(uri.fsPath), vscode.TreeItemCollapsibleState.Collapsed);
        this.uri = uri;
        this.tooltip = uri.fsPath;
        this.contextValue = 'modFolder';
    }
    iconPath = {
        light: path.join(__filename, '..', '..', 'resources', 'light', 'folder.svg'),
        dark: path.join(__filename, '..', '..', 'resources', 'dark', 'folder.svg')
    };
}
function activate(context) {
    const modFileViewerProvider = new ModFileViewerProvider();
    const treeView = vscode.window.createTreeView('modFileViewer', {
        treeDataProvider: modFileViewerProvider,
        canSelectMany: true
    });
    let openModFileDisposable = vscode.commands.registerCommand('extension.openModFile', (uri) => {
        vscode.workspace.openTextDocument(uri).then(doc => {
            vscode.window.showTextDocument(doc);
        });
    });
    context.subscriptions.push(openModFileDisposable);
    treeView.onDidChangeSelection(event => {
        const selected = event.selection[0];
        if (selected instanceof ModFile) {
            vscode.commands.executeCommand('extension.openModFile', selected.uri);
        }
    });
    let showModFileContextMenuDisposable = vscode.commands.registerCommand('extension.showModFileContextMenu', () => {
        (0, commands_1.showModFileContextMenu)(treeView);
    });
    context.subscriptions.push(showModFileContextMenuDisposable);
    let showSumoCommandDisposable = vscode.commands.registerCommand('extension.showSumoCommand', () => {
        const selectedNodes = treeView.selection;
        if (selectedNodes.length === 0) {
            vscode.window.showInformationMessage('No items selected.');
            return;
        }
        const lstFilePaths = selectedNodes.map(node => node.uri.fsPath.replace(/\.[^.]+$/, '.lst')); // mod 확장자를 lst로 변경
        // 현재 파일의 디렉토리로 작업 디렉토리 변경
        const options = {
            cwd: path.dirname(selectedNodes[0].uri.fsPath)
        };
        lstFilePaths.forEach(lstFilePath => {
            if (!fs.existsSync(lstFilePath)) {
                vscode.window.showErrorMessage(`File ${path.basename(lstFilePath)} does not exist.`);
                return;
            }
        });
        vscode.window.showInputBox({
            prompt: 'Enter parameters for Sumo command:',
            value: `sumo ${lstFilePaths.map(filePath => path.basename(filePath)).join(' ')}`
        }).then(input => {
            if (input) {
                const outputFileNames = lstFilePaths.map(filePath => `${path.basename(filePath, path.extname(filePath))}_sumo.txt`);
                const outputFilePaths = outputFileNames.map(fileName => path.join(path.dirname(lstFilePaths[0]), fileName));
                const commands = outputFilePaths.map((outputFilePath, index) => `${input} > ${outputFilePath} 2>&1`);
                commands.forEach((command, index) => {
                    childProcess.exec(command, options, (error, stdout, stderr) => {
                        if (error) {
                            vscode.window.showErrorMessage(`Error executing command: ${stderr}`);
                            return;
                        }
                        // Read the output file and show it in a WebView
                        fs.readFile(outputFilePaths[index], 'utf-8', (err, data) => {
                            if (err) {
                                vscode.window.showErrorMessage(`Error reading output file: ${err.message}`);
                                return;
                            }
                            const panel = vscode.window.createWebviewPanel('sumoOutput', outputFileNames[index], vscode.ViewColumn.One, {});
                            panel.webview.html = getWebviewContent(data);
                        });
                    });
                });
            }
        });
    });
    context.subscriptions.push(showSumoCommandDisposable);
    let manageRScriptCommandDisposable = vscode.commands.registerCommand('extension.manageRScriptCommand', (node) => {
        const scriptsFolder = path.join(context.extensionPath, 'Rscripts');
        if (!fs.existsSync(scriptsFolder)) {
            fs.mkdirSync(scriptsFolder);
        }
        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(scriptsFolder), true);
    });
    context.subscriptions.push(manageRScriptCommandDisposable);
    let showRScriptCommandDisposable = vscode.commands.registerCommand('extension.showRScriptCommand', (node) => {
        const scriptsFolder = path.join(context.extensionPath, 'Rscripts');
        if (!fs.existsSync(scriptsFolder)) {
            fs.mkdirSync(scriptsFolder);
        }
        fs.readdir(scriptsFolder, (err, files) => {
            if (err) {
                vscode.window.showErrorMessage(`Error reading scripts folder: ${err.message}`);
                return;
            }
            const scriptFiles = files.map(file => ({
                label: path.basename(file),
                description: path.join(scriptsFolder, file)
            }));
            vscode.window.showQuickPick(scriptFiles, { placeHolder: 'Select an R script to execute' }).then(selected => {
                if (selected) {
                    vscode.workspace.openTextDocument(selected.description).then(doc => {
                        // vscode.window.showTextDocument(doc);
                    });
                    const workingDir = path.dirname(node.uri.fsPath);
                    // const baseFileName = path.basename(node.uri.fsPath, path.extname(node.uri.fsPath));
                    // Use file name with extension
                    const baseFileName = path.basename(node.uri.fsPath);
                    // Copy R script
                    const scriptPath = selected.description;
                    let scriptContent = fs.readFileSync(scriptPath, 'utf-8');
                    // Change NMBENCH object lines
                    scriptContent = scriptContent.replace(/nmbench_selec <- # MODEL_FILE_IN/g, `nmbench_selec <- "${baseFileName}"`);
                    scriptContent = scriptContent.replace(/nmbench_wkdir <- # MODEL_FOLDER_IN/g, `nmbench_wkdir <- "${workingDir}"`);
                    const tempScriptPath = path.join(workingDir, `temp_${path.basename(scriptPath)}`);
                    fs.writeFileSync(tempScriptPath, scriptContent);
                    const terminal = vscode.window.createTerminal({ cwd: workingDir });
                    terminal.sendText(`Rscript "${tempScriptPath}"`);
                    terminal.show();
                    // Temporary file cleanup can be added here if needed
                    setTimeout(() => {
                        if (fs.existsSync(tempScriptPath)) {
                            fs.unlinkSync(tempScriptPath);
                        }
                    }, 20000); // 10 seconds delay before deleting the temporary script
                }
            });
        });
    });
    context.subscriptions.push(showRScriptCommandDisposable);
    let showLinkedFilesDisposable = vscode.commands.registerCommand('extension.showLinkedFiles', (node) => {
        const dir = path.dirname(node.uri.fsPath);
        const baseName = path.basename(node.uri.fsPath, path.extname(node.uri.fsPath));
        fs.readdir(dir, (err, files) => {
            if (err) {
                vscode.window.showErrorMessage(`Error reading directory: ${err.message}`);
                return;
            }
            const linkedFiles = files
                .filter(file => path.basename(file, path.extname(file)) === baseName && file !== path.basename(node.uri.fsPath))
                .map(file => ({
                label: path.basename(file),
                description: path.join(dir, file)
            }));
            if (linkedFiles.length === 0) {
                vscode.window.showInformationMessage('No linked files found.');
                return;
            }
            vscode.window.showQuickPick(linkedFiles).then(selected => {
                if (selected) {
                    vscode.workspace.openTextDocument(vscode.Uri.file(selected.description)).then(doc => {
                        vscode.window.showTextDocument(doc);
                    });
                }
            });
        });
    });
    context.subscriptions.push(showLinkedFilesDisposable);
    let refreshCommandDisposable = vscode.commands.registerCommand('extension.refreshModFileViewer', () => {
        modFileViewerProvider.refresh();
    });
    context.subscriptions.push(refreshCommandDisposable);
}
exports.activate = activate;
function getWebviewContent(output) {
    const thetaClass = 'theta-highlight';
    const omegaClass = 'omega-highlight';
    const sigmaClass = 'sigma-highlight';
    const highlightedOutput = output.replace(/(^|\n)((?:[^\n]*?\b(THETA|OMEGA|SIGMA)\b[^\n]*?)($|\n))/gm, (match, lineStart, lineContent) => {
        if (lineContent.includes('THETA') && lineContent.includes('OMEGA') && lineContent.includes('SIGMA')) {
            const thetaRegex = /\bTHETA\b/g;
            const omegaRegex = /\bOMEGA\b/g;
            const sigmaRegex = /\bSIGMA\b/g;
            return lineStart + lineContent
                .replace(thetaRegex, `<span class="${thetaClass}">THETA</span>`)
                .replace(omegaRegex, `<span class="${omegaClass}">OMEGA</span>`)
                .replace(sigmaRegex, `<span class="${sigmaClass}">SIGMA</span>`);
        }
        return match;
    });
    const styledOutput = highlightedOutput.replace(/\b(OK|WARNING|ERROR)\b/g, match => {
        switch (match) {
            case 'OK':
                return `<span class="ok-highlight">${match}</span>`;
            case 'WARNING':
                return `<span class="warning-highlight">${match}</span>`;
            case 'ERROR':
                return `<span class="error-highlight">${match}</span>`;
            default:
                return match;
        }
    });
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Sumo Output</title>
            <style>
                .${thetaClass} { color: #6699cc; }
                .${omegaClass} { color: #66cc99; }
                .${sigmaClass} { color: #ff6666; }
                .ok-highlight { color: #66cc99; }
                .warning-highlight { color: orange; }
                .error-highlight { color: #ff6666; }
            </style>
        </head>
        <body>
            <pre>${styledOutput}</pre>
        </body>
        </html>
    `;
}
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map