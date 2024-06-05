import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as util from 'util';
import * as childProcess from 'child_process';
import { showModFileContextMenu, showModFileContextMenuNONMEM, showRScriptCommand } from './commands';

const readFile = util.promisify(fs.readFile);

class ModFileViewerProvider implements vscode.TreeDataProvider<ModFile | ModFolder> {
    private _onDidChangeTreeData: vscode.EventEmitter<ModFile | ModFolder | undefined> = new vscode.EventEmitter<ModFile | ModFolder | undefined>();
    readonly onDidChangeTreeData: vscode.Event<ModFile | ModFolder | undefined> = this._onDidChangeTreeData.event;

    refresh(element?: ModFile | ModFolder): void {
        this._onDidChangeTreeData.fire(element);
    }

    getTreeItem(element: ModFile | ModFolder): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ModFile | ModFolder): Promise<(ModFile | ModFolder)[]> {
        if (!element) {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {return [];}
            return workspaceFolders.map(folder => new ModFolder(folder.uri));
        } else if (element instanceof ModFolder) {
            try {
                const files = await fs.promises.readdir(element.uri.fsPath);
                const folders: ModFolder[] = [];
                const modFiles: ModFile[] = [];

                for (const file of files) {
                    const filePath = path.join(element.uri.fsPath, file);
                    const stat = await fs.promises.stat(filePath);
                    if (stat.isDirectory()) {
                        folders.push(new ModFolder(vscode.Uri.file(filePath)));
                    } else if (file.match(/\.(mod|ctl)$/)) {
                        const modFile = new ModFile(vscode.Uri.file(filePath));
                        await modFile.checkTerminal();
                        modFiles.push(modFile);
                    }
                }
                return [...folders, ...modFiles];
            } catch (err) {
                console.error('Failed to read directory:', err);
                return [];
            }
        } else {
            return [];
        }
    }

    async getModFileOrFolder(uri: vscode.Uri): Promise<ModFile | ModFolder | undefined> {
        const currentDir = path.dirname(uri.fsPath);
        const files = await fs.promises.readdir(currentDir);
        const children = await Promise.all(files.map(async file => {
            const filePath = path.join(currentDir, file);
            const stat = await fs.promises.stat(filePath);
            if (stat.isDirectory()) {
                return new ModFolder(vscode.Uri.file(filePath));
            } else if (file.match(/\.(mod|ctl)$/)) {
                const modFile = new ModFile(vscode.Uri.file(filePath));
                await modFile.checkTerminal();
                return modFile;
            }
        }));
        return children.find(child => child?.uri.fsPath === uri.fsPath);
    }

    getParent(element: ModFile | ModFolder): vscode.ProviderResult<ModFile | ModFolder> {
        const parentUri = path.dirname(element.uri.fsPath);
        if (parentUri === element.uri.fsPath) {return null;}
        return new ModFolder(vscode.Uri.file(parentUri));
    }
}

class ModFile extends vscode.TreeItem {
    constructor(public readonly uri: vscode.Uri) {
        super(path.basename(uri.fsPath));
        const fileContent = fs.readFileSync(uri.fsPath, 'utf-8');
        this.tooltip = this.extractDescription(fileContent) || uri.fsPath;
        this.contextValue = 'modFile';

        const statuses = this.getStatuses();
        this.tooltip = statuses.map(status => status.text).join(' ');
        this.description = statuses.filter(status => status.code !== '✔️' && status.code !== '❌').map(status => status.code).join(' ');

        if (statuses.length > 0) {
            this.iconPath = this.getStatusIconPath(statuses[0].text);
        } else {
            this.iconPath = new vscode.ThemeIcon('file');
        }

        const objectiveFunctionValue = this.getObjectiveFunctionValue();
        if (objectiveFunctionValue) {
            this.description += ` ${objectiveFunctionValue}`;
        }
    }

    private extractDescription(content: string): string | null {
        const descriptionRegex = /.*Description:\s*(.*)/i;
        const match = content.match(descriptionRegex);
        return match ? match[1] : null;
    }

    private getStatuses(): { text: string, code: string }[] {
        const lstFilePath = this.uri.fsPath.replace(/\.[^.]+$/, '.lst');
        if (!fs.existsSync(lstFilePath)) {
            return [];
        }

        const content = fs.readFileSync(lstFilePath, 'utf-8');
        const statuses: { text: string, code: string }[] = [];
        if (content.includes('MINIMIZATION SUCCESSFUL')) {
            statuses.push({ text: 'Minimization Successful', code: 'S' });
        }
        if (content.includes('TERMINATED')) {
            statuses.push({ text: 'Minimization Terminated', code: 'T' });
        }
        if (content.includes('SIMULATION STEP PERFORMED')) {
            statuses.push({ text: 'Simulation', code: 'SIM' });
        }
        if (content.includes('DUE TO ROUNDING ERRORS')) {
            statuses.push({ text: 'w Rounding Error', code: 'R' });
        }
        if (content.includes('PARAMETER ESTIMATE IS NEAR ITS BOUNDARY')) {
            statuses.push({ text: 'w Boundary Error', code: 'B' });
        }
        const covarianceStep = content.includes('Elapsed covariance  time in seconds');
        const matrixSingular = content.includes('MATRIX ALGORITHMICALLY');
        if (matrixSingular) {
            statuses.push({ text: 'w Matrix Error', code: 'M' });
        } else if (covarianceStep) {
            statuses.push({ text: 'w Covariance Step done', code: 'C' });
        }

        return statuses;
    }

    private getStatusIconPath(statusText: string): vscode.ThemeIcon {
        switch (statusText) {
            case 'Minimization Successful':
                return new vscode.ThemeIcon('file', new vscode.ThemeColor('charts.green'));
            case 'Minimization Terminated':
                return new vscode.ThemeIcon('file', new vscode.ThemeColor('charts.red'));
            case 'Simulation':
                return new vscode.ThemeIcon('file', new vscode.ThemeColor('charts.blue'));
            default:
                return new vscode.ThemeIcon('file');
        }
    }

    private getObjectiveFunctionValue(): string | null {
        const lstFilePath = this.uri.fsPath.replace(/\.[^.]+$/, '.lst');
        if (!fs.existsSync(lstFilePath)) {
            return null;
        }

        const content = fs.readFileSync(lstFilePath, 'utf-8');
        const objectiveFunctionRegex = /OBJECTIVE\s+FUNCTION\s+VALUE\s+WITHOUT\s+CONSTANT:\s*(-?\d+(\.\d+)?)/i;
        const match = content.match(objectiveFunctionRegex);
        if (match) {
            const value = parseFloat(match[1]);
            const roundedValue = value.toFixed(2);
            return `OFV: ${roundedValue}`;
        }
        return null;
    }

    async checkTerminal() {
        const terminals = vscode.window.terminals;
        const fileName = path.basename(this.uri.fsPath);
        for (const terminal of terminals) {
            if (terminal.name.includes(fileName)) {
                this.iconPath = new vscode.ThemeIcon('coffee', new vscode.ThemeColor('charts.yellow'));
                break;
            }
        }
    }
}

class ModFolder extends vscode.TreeItem {
    constructor(public readonly uri: vscode.Uri) {
        super(path.basename(uri.fsPath), vscode.TreeItemCollapsibleState.Collapsed);
        this.tooltip = uri.fsPath;
        this.contextValue = 'modFolder';
        this.iconPath = {
            light: path.join(__filename, '..', '..', 'resources', 'light', 'folder.svg'),
            dark: path.join(__filename, '..', '..', 'resources', 'dark', 'folder.svg')
        };
    }
}

export function activate(context: vscode.ExtensionContext) {
    const modFileViewerProvider = new ModFileViewerProvider();
    const treeView = vscode.window.createTreeView('modFileViewer', {
        treeDataProvider: modFileViewerProvider,
        canSelectMany: true // 전체 트리에 다중 선택 허용
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.openModFile', (uri: vscode.Uri) => {
            vscode.workspace.openTextDocument(uri).then(doc => {
                vscode.window.showTextDocument(doc, vscode.ViewColumn.One, true);
            });
        }),
        vscode.commands.registerCommand('extension.refreshModFileViewer', () => {
            modFileViewerProvider.refresh();
        }),
        vscode.commands.registerCommand('extension.showModFileContextMenu', (uri: vscode.Uri) => {
            showModFileContextMenu([uri]);
        }),
        vscode.commands.registerCommand('extension.showModFileContextMenuFromTreeView', () => {
            const selectedNodes = treeView.selection as (ModFile | ModFolder)[];
            if (!selectedNodes || selectedNodes.length === 0) {
                vscode.window.showInformationMessage('No items selected.');
                return;
            }
            showModFileContextMenu(selectedNodes);
        }),
        vscode.commands.registerCommand('extension.showModFileContextMenuNONMEM', (uri: vscode.Uri) => {
            showModFileContextMenuNONMEM([uri], context);
        }),
        vscode.commands.registerCommand('extension.showSumoCommand', () => {
            const selectedNodes = treeView.selection;
            if (selectedNodes.length === 0) {
                vscode.window.showInformationMessage('No items selected.');
                return;
            }

            const lstFilePaths = selectedNodes.map(node => node.uri.fsPath.replace(/\.[^.]+$/, '.lst'));

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
                    const outputFileName = selectedNodes.length > 1 ? 'sumo_compare.txt' : `${path.basename(lstFilePaths[0], path.extname(lstFilePaths[0]))}_sumo.txt`;
                    const outputFilePath = path.join(path.dirname(lstFilePaths[0]), outputFileName);
                    const command = `${input} > ${outputFilePath} 2>&1`;

                    childProcess.exec(command, options, (error, stdout, stderr) => {
                        if (error) {
                            vscode.window.showErrorMessage(`Error executing command: ${stderr}`);
                            return;
                        }

                        fs.readFile(outputFilePath, 'utf-8', (err, data) => {
                            if (err) {
                                vscode.window.showErrorMessage(`Error reading output file: ${err.message}`);
                                return;
                            }

                            const panel = vscode.window.createWebviewPanel(
                                'sumoOutput',
                                outputFileName,
                                vscode.ViewColumn.One,
                                {}
                            );

                            panel.webview.html = getWebviewContent(data);
                        });
                    });
                }
            });
        }),
        vscode.commands.registerCommand('extension.manageRScriptCommand', (node: ModFile | ModFolder) => {
            const scriptsFolder = path.join(context.extensionPath, 'Rscripts');
            if (!fs.existsSync(scriptsFolder)) {
                fs.mkdirSync(scriptsFolder);
            }

            vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(scriptsFolder), true);
        }),
        vscode.commands.registerCommand('extension.showRScriptCommandFromTreeView', () => {
            const selectedNodes = treeView.selection as (ModFile | ModFolder)[];
            if (!selectedNodes || selectedNodes.length === 0) {
                vscode.window.showInformationMessage('No items selected.');
                return;
            }
            showRScriptCommand(context, selectedNodes);
        }),
        vscode.commands.registerCommand('extension.showRScriptCommandFromEditor', (uri: vscode.Uri) => {
            showRScriptCommand(context, [uri]);
        }),
        vscode.commands.registerCommand('extension.showLinkedFiles', async (node: ModFile) => {
            if (!node) {
                vscode.window.showErrorMessage('No file selected.');
                return;
            }
        
            const dir = path.dirname(node.uri.fsPath);
            const baseName = path.basename(node.uri.fsPath, path.extname(node.uri.fsPath));
        
            fs.readdir(dir, async (err, files) => {
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
                    
                const additionalFiles: { label: string; description: string; }[] = [];
                const fileContent = await readFile(node.uri.fsPath, 'utf-8');
                const tableLines = fileContent.split('\n').filter(line => line.includes('$TABLE'));
                tableLines.forEach(line => {
                    const match = line.match(/\bFILE\s*=\s*(\S+)/i);
                    if (match) {
                        const fileName = match[1];
                        const foundFiles = files
                            .filter(file => path.basename(file) === fileName)
                            .map(file => ({
                                label: path.basename(file),
                                description: path.join(dir, file)
                            }));
                        additionalFiles.push(...foundFiles);
                    }
                });

                const allFiles = [...linkedFiles, ...additionalFiles];
                if (allFiles.length === 0) {
                    vscode.window.showInformationMessage('No linked files found.');
                    return;
                }

                vscode.window.showQuickPick(allFiles).then(selected => {
                    if (selected) {
                        vscode.workspace.openTextDocument(vscode.Uri.file(selected.description!)).then(doc => {
                            vscode.window.showTextDocument(doc);
                        });
                    }
                });
            });
        }),
        vscode.commands.registerCommand('extension.showHeatmap', function () {
            const editor = vscode.window.activeTextEditor;

            if (editor) {
                const content = editor.document.getText();
                const tables = parseTables(content);

                const panel = vscode.window.createWebviewPanel(
                    'heatmapViewer',
                    'Heatmap Viewer',
                    vscode.ViewColumn.One,
                    {
                        enableScripts: true
                    }
                );

                panel.webview.html = getWebviewContent_heatmap(tables);
            } else {
                vscode.window.showErrorMessage('No active editor found. Please open a file first.');
            }
        })
    );

    treeView.onDidChangeSelection(event => {
        const selected = event.selection[0];
        if (selected instanceof ModFile) {
            vscode.commands.executeCommand('extension.openModFile', selected.uri);
        }
    });

    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && editor.document.uri.scheme === 'file' && editor.document.uri.fsPath.match(/\.(mod|ctl)$/)) {
            modFileViewerProvider.getModFileOrFolder(editor.document.uri).then(item => {
                if (item) {
                    treeView.reveal(item, { select: true, focus: true });
                }
            });
        }
    });

    vscode.window.onDidOpenTerminal(() => {
        modFileViewerProvider.refresh();
    });

    vscode.window.onDidCloseTerminal(() => {
        modFileViewerProvider.refresh();
    });

    vscode.window.onDidChangeActiveTerminal(() => {
        modFileViewerProvider.refresh();
    });
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.readNmTableAndPlot', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const document = editor.document;
                const fileName = document.fileName;

                if (fileName.match(/sdtab\d*|patab\d*/)) {
                    const data = await readNmTable(fileName);
                    const panel = vscode.window.createWebviewPanel(
                        'nmTablePlot',
                        'NM Table Plot',
                        vscode.ViewColumn.One,
                        { enableScripts: true }
                    );

                    // Get the current theme
                    const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'vscode-dark' : 'vscode-light';
                    panel.webview.html = getWebviewContent_plotly(data, theme);

                    // Handle messages from the webview
                    panel.webview.onDidReceiveMessage(message => {
                        if (message.command === "updatePlot") {
                            panel.webview.postMessage({ command: "plotData", data: data, config: message.config });
                        }
                    });
                }
            }
        })
    );

}

function getWebviewContent(output: string): string {
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

function parseTables(content: string) {
    const tables = content.split(/TABLE\s/).filter((section: string) => section.trim() !== '');
    return tables.map((table: string) => {
        const rows = table.trim().split('\n');
        return rows.map((row: string) => row.trim().split(/\s+/).map(cell => parseFloat(cell) || cell));
    });
}

function getWebviewContent_heatmap(tables: any[]) {
    let min = Number.MAX_VALUE;
    let max = Number.MIN_VALUE;
    tables.forEach(table => {
        table.forEach((row: any[], rowIndex: any) => {
            row.forEach((cell, colIndex) => {
                if (rowIndex - 1 !== colIndex) {
                    if (!isNaN(cell)) {
                        min = Math.min(min, cell);
                        max = Math.max(max, cell);
                    }
                }
            });
        });
    });

    const tablesHTML = tables.map(table => {
        const rowsHTML = table.map((row: any[], rowIndex: any) => {
            if (rowIndex === 0) {return '';}
            const cellsHTML = row.map((cell, colIndex) => {
                const isOffDiagonal = rowIndex - 1 !== colIndex;
                const cellStyle = isOffDiagonal ? `style="background-color: ${getColor(cell, min, max)}"` : '';
                return `<td ${cellStyle}>${cell}</td>`;
            }).join('');
            return `<tr>${cellsHTML}</tr>`;
        }).join('');
        return `<table>${rowsHTML}</table>`;
    }).join('<br><br>');

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Heatmap Viewer</title>
            <style>
                body {
                    font-family: monospace;
                }
                table {
                    border-collapse: separate;
                    margin-bottom: 10px;
                    font-size: smaller;
                }
                td {
                    border-radius: 3px;
                    border: 1px;
                    padding: 3px;
                }
            </style>
        </head>
        <body>
            ${tablesHTML}
        </body>
        </html>`;
}

function getColor(value: number, min: number, max: number): string {
    const range = Math.max(Math.abs(min), Math.abs(max));
    const normalizedValue = value / range;
    const hue = 120 * (1 - normalizedValue);

    if (normalizedValue === 0) {
        return `hsl(0, 0%, 60%, 30%)`;
    }

    return `hsl(${hue}, 100%, 50%, 60%)`;
}

async function readNmTable(filePath: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                reject(err);
                return;
            }
            const lines = data.split('\n').filter(line => line.trim() !== '');
            const header = lines[1].trim().split(/\s+/);
            const rows = lines.slice(2).map(line => {
                const values = line.trim().split(/\s+/);
                const row: { [key: string]: string | number } = {};
                header.forEach((col, index) => {
                    row[col] = isNaN(Number(values[index])) ? values[index] : Number(values[index]);
                });
                return row;
            });
            resolve(rows);
        });
    });
}

function getWebviewContent_plotly(data: any[], theme: string): string {
    const columns = Object.keys(data[0]);

    // Determine colors based on the theme
    const isDarkTheme = theme === 'vscode-dark' || theme === 'vscode-high-contrast';
    const axisColor = isDarkTheme ? 'white' : 'black';
    const backgroundColor = 'rgba(0, 0, 0, 0)'; // Transparent

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>NM Table Plot</title>
            <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
            <style>
                body { margin: 0; padding: 0; }
                #plot { width: 100vw; height: 100vh; background: transparent; }
                .controls { position: absolute; top: 10px; left: 10px; z-index: 100; background: white; padding: 10px; border-radius: 5px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.5); }
            </style>
        </head>
        <body>
            <div class="controls">
                <label for="xSelect">X-axis:</label>
                <select id="xSelect">${columns.map(col => `<option value="${col}">${col}</option>`).join('')}</select>
                <label for="ySelect">Y-axis:</label>
                <select id="ySelect">${columns.map(col => `<option value="${col}">${col}</option>`).join('')}</select>
                <label for="groupSelect">Grouping Variable:</label>
                <select id="groupSelect">${columns.map(col => `<option value="${col}">${col}</option>`).join('')}</select>
                <button id="updatePlot">Update Plot</button>
                <button id="addYXLine">Add y=x Line</button>
                <button id="toggleSubplot">Toggle Subplot</button>
            </div>
            <div id="plot"></div>
            <script>
                const vscode = acquireVsCodeApi();
                let yxLineAdded = false;
                let subplotMode = true;

                document.getElementById("updatePlot").addEventListener("click", function () {
                    updatePlot();
                });

                document.getElementById("addYXLine").addEventListener("click", function () {
                    yxLineAdded = !yxLineAdded;
                    updatePlot();
                });

                document.getElementById("toggleSubplot").addEventListener("click", function () {
                    subplotMode = !subplotMode;
                    updatePlot();
                });

                function updatePlot() {
                    const x = document.getElementById("xSelect").value;
                    const y = document.getElementById("ySelect").value;
                    const group = document.getElementById("groupSelect").value;
                    vscode.postMessage({ command: "updatePlot", config: { x: x, y: y, group: group, addYXLine: yxLineAdded, subplotMode: subplotMode } });
                }

                window.addEventListener("message", function (event) {
                    const message = event.data;
                    if (message.command === "plotData") {
                        const data = message.data;
                        const config = message.config;
                        const groups = Array.from(new Set(data.map(row => row[config.group])));
                        const figData = [];
                        const layout = {
                            title: "NM Table Plot",
                            showlegend: false,
                            margin: { t: 20, b: 40, l: 40, r: 20 },
                            paper_bgcolor: '${backgroundColor}',
                            plot_bgcolor: '${backgroundColor}',
                            font: { color: '${axisColor}' }
                        };

                        if (config.subplotMode) {
                            const plotWidth = document.getElementById("plot").clientWidth;
                            let numCols = Math.floor(plotWidth / 250); // 250px per plot column
                            if (numCols < 1) numCols = 1; // 최소 1열은 유지
                            const numRows = Math.ceil(groups.length / numCols);
                            layout.grid = { rows: numRows, columns: numCols, pattern: "independent" };

                            const xGap = 0.02; // 서브플롯 간 수평 여백 비율
                            const yGap = 0.02; // 서브플롯 간 수직 여백 비율
                            const annotations = [];

                            groups.forEach(function (group, i) {
                                const filteredData = data.filter(row => row[config.group] === group);
                                const trace = {
                                    x: filteredData.map(row => row[config.x]),
                                    y: filteredData.map(row => row[config.y]),
                                    type: "scatter",
                                    mode: "lines+markers",
                                    name: group,
                                    xaxis: "x" + (i + 1),
                                    yaxis: "y" + (i + 1)
                                };
                                figData.push(trace);
                                if (config.addYXLine) {
                                    const minVal = Math.min(...filteredData.map(row => Math.min(row[config.x], row[config.y])));
                                    const maxVal = Math.max(...filteredData.map(row => Math.max(row[config.x], row[config.y])));
                                    const lineTrace = {
                                        x: [minVal, maxVal],
                                        y: [minVal, maxVal],
                                        type: "scatter",
                                        mode: "lines",
                                        line: { dash: 'dash', color: 'grey' },
                                        showlegend: false,
                                        xaxis: "x" + (i + 1),
                                        yaxis: "y" + (i + 1)
                                    };
                                    figData.push(lineTrace);
                                }
                                const row = Math.floor(i / numCols) + 1;
                                const col = (i % numCols) + 1;
                                const xDomainStart = (col - 1) / numCols + xGap;
                                const xDomainEnd = col / numCols - xGap;
                                const yDomainStart = 1 - row / numRows + yGap;
                                const yDomainEnd = 1 - (row - 1) / numRows - yGap;
                                layout["xaxis" + (i + 1)] = { domain: [xDomainStart, xDomainEnd], showticklabels: false };
                                layout["yaxis" + (i + 1)] = { domain: [yDomainStart, yDomainEnd], showticklabels: false };

                                // Add title for each subplot
                                annotations.push({
                                    x: xDomainStart + (xDomainEnd - xDomainStart) / 2,
                                    y: yDomainEnd,
                                    xref: 'paper',
                                    yref: 'paper',
                                    text: group,
                                    showarrow: false,
                                    xanchor: 'center',
                                    yanchor: 'bottom'
                                });
                            });

                            // Add common x and y axis titles
                            layout.annotations = annotations.concat([
                                {
                                    text: config.x,
                                    x: 0.5,
                                    xref: 'paper',
                                    y: 0,
                                    yref: 'paper',
                                    showarrow: false,
                                    xanchor: 'center',
                                    yanchor: 'top'
                                },
                                {
                                    text: config.y,
                                    x: 0,
                                    xref: 'paper',
                                    y: 0.5,
                                    yref: 'paper',
                                    showarrow: false,
                                    xanchor: 'right',
                                    yanchor: 'middle',
                                    textangle: -90
                                }
                            ]);
                        } else {
                            // 하나의 플롯에 모든 그룹을 표시하는 모드
                            groups.forEach(function (group) {
                                const filteredData = data.filter(row => row[config.group] === group);
                                const trace = {
                                    x: filteredData.map(row => row[config.x]),
                                    y: filteredData.map(row => row[config.y]),
                                    type: "scatter",
                                    mode: "lines+markers",
                                    name: group
                                };
                                figData.push(trace);
                                if (config.addYXLine) {
                                    const minVal = Math.min(...filteredData.map(row => Math.min(row[config.x], row[config.y])));
                                    const maxVal = Math.max(...filteredData.map(row => Math.max(row[config.x], row[config.y])));
                                    const lineTrace = {
                                        x: [minVal, maxVal],
                                        y: [minVal, maxVal],
                                        type: "scatter",
                                        mode: "lines",
                                        line: { dash: 'dash', color: 'grey' },
                                        showlegend: false
                                    };
                                    figData.push(lineTrace);
                                }
                            });

                            // Add common x and y axis titles
                            layout.xaxis = { title: config.x, showticklabels: true };
                            layout.yaxis = { title: config.y, showticklabels: true };
                        }

                        Plotly.newPlot("plot", figData, layout, { responsive: true });
                    }
                });
            </script>
        </body>
        </html>
    `;
}
export function deactivate() {}
