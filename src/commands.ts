import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

function isUriArray(nodes: any[]): nodes is vscode.Uri[] {
    return nodes.every(node => node instanceof vscode.Uri);
}

function isTreeItemArray(nodes: any[]): nodes is (vscode.TreeItem & { uri: vscode.Uri })[] {
    return nodes.every(node => node instanceof vscode.TreeItem && 'uri' in node);
}

function runDockerCommandPrefix() {
    const config = vscode.workspace.getConfiguration('nmbench');
    if (config.docker.imageName === undefined || config.docker.imageName === '') {
        return '';
    }
    const workdir_local = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    const workdir_container = config.docker.container.workspaceDir;

    const license_file_local = config.licensePath;
    const license_file_container = config.docker.container.licensePath;

    return `docker run --rm -v ${workdir_local}:${workdir_container} -v ${license_file_local}:${license_file_container} -w ${workdir_container} ${config.docker.imageName}`;
}

const psn_cmds = [
    'execute',
    'vpc',
    'npc',
    'bootstrap',
    'cdd',
    'llp',
    'sir',
    'ebe_npde',
    'sse',
    'scm',
    'xv_scm',
    'boot_scm',
    'lasso',
    'nca',
    'nonpb',
    'mimp',
    'gls',
    'parallel_retries',
    'precond',
    'update_inits'
];
// Function for PsN(Perl-speaks-NONMEM) run
export function showModFileContextMenu(nodes: (vscode.Uri | (vscode.TreeItem & { uri: vscode.Uri }))[]) {
    let uris: vscode.Uri[];

    if (isUriArray(nodes)) {
        uris = nodes;
    } else if (isTreeItemArray(nodes)) {
        uris = nodes.map(node => node.uri);
    } else {
        vscode.window.showErrorMessage('Invalid selection');
        return;
    }

    if (uris.length === 0) {
        vscode.window.showInformationMessage('No items selected.');
        return;
    }

    vscode.window.showQuickPick(psn_cmds).then(selectedCommand => {
        if (selectedCommand === undefined) { return; }
        const fileNames = uris.map(uri => path.basename(uri.fsPath)).join(' ');

        switch (selectedCommand) {
            case 'execute':
                vscode.window.showQuickPick([
                    { label: '-rplots=1', description: 'generate basic rplots after model run' },
                    { label: '-zip', description: 'compressed results in .zip file' },
                    { label: '-display_iterations', description: 'display iterations' }
                ], {
                    canPickMany: true,
                    placeHolder: 'Select optional commands to add'
                }).then(selectedOptions => {
                    runTerminal(selectedCommand, uris, undefined, selectedOptions, fileNames);
                    // psnExecute(fileNames, selectedCommand, uris);
                });
                break;
            case 'vpc':
                // psnVPC(fileNames, selectedCommand, uris);
                vscode.window.showQuickPick([
                    { label: '-rplots=1', description: 'generate basic rplots after model run' },
                    { label: '-predcorr', description: 'perform prediction corrected VPC' },
                    { label: '-stratify_on=', description: 'stratification' },
                    { label: '-varcorr', description: 'variability correction on DVs before computing' },
                    { label: '-dir=', description: 'name direction for output' }
                ], {
                    canPickMany: true,
                    placeHolder: 'Select optional commands to add'
                }).then(selectedOptions => {
                    runTerminal(selectedCommand, uris, undefined, selectedOptions, fileNames);
                });
                break;
            case 'bootstrap':
                // psnBootstrap(fileNames, selectedCommand, uris);
                vscode.window.showQuickPick([
                    { label: '-rplots=1', description: 'generate basic rplots after model run' },
                    { label: '-stratify_on=', description: 'stratification' },
                    { label: '-dir=', description: 'name direction for output' },
                    { label: '-keep covariance=', description: 'Keep $COV, can affect run time significantly' },
                    { label: '-allow_ignore_id', description: 'Program continues execution with IGNORE/ACCEPT statement' }
                ], {
                    canPickMany: true,
                    placeHolder: 'Select optional commands to add'
                }).then(selectedOptions => {
                    runTerminal(selectedCommand, uris, undefined, selectedOptions, fileNames);
                });
                break;
            case 'npc':
                runTerminal(selectedCommand, uris, ['-samples=200'], undefined, fileNames);
                // defaultCommandSyntax = `npc -samples=200 ${fileNames}`;
                break;
            case 'cdd':
                // defaultCommandSyntax = `cdd -case_column=ID -bins=100 ${fileNames}`;
                runTerminal(selectedCommand, uris, ['-case_column=ID', '-bins=100']);
                break;
            case 'llp':
                // defaultCommandSyntax = `llp -omegas='' --sigmas='' --thetas='' ${fileNames}`;
                runTerminal(selectedCommand, uris, ['--omegas=\'\'', '--sigmas=\'\'', '--thetas=\'\''], undefined, fileNames);
                break;
            case 'sir':
                // defaultCommandSyntax = `sir -samples=500 -resample ${fileNames}`;
                runTerminal(selectedCommand, uris, ['-samples=500', '-resample'], undefined, fileNames);
                break;
            case 'ebe_npde':
                // defaultCommandSyntax = `ebe_npde ${fileNames}`;
                runTerminal(selectedCommand, uris, undefined, undefined, fileNames);
                break;
            case 'sse':
                // defaultCommandSyntax = `sse -samples=500 -no_estimate_simulation - alt=run1.mod ${fileNames}`;
                runTerminal(selectedCommand, uris, ['-samples=500', '-no_estimate_simulation', '-alt=run1.mod'], undefined, fileNames);
                break;
            case 'scm':
                // defaultCommandSyntax = `scm -config_file ${fileNames}`;
                runTerminal(selectedCommand, uris, [`-config_file=${fileNames}`]);
                break;
            case 'xv_scm':
                // defaultCommandSyntax = `xv_scm -config_file= ${fileNames}`;
                runTerminal(selectedCommand, uris, [`-config_file=${fileNames}`], undefined, fileNames);
                break;
            case 'boot_scm':
                // defaultCommandSyntax = `boot_scm -samples=100 -threads=4 -config_file= ${fileNames}`;
                runTerminal(selectedCommand, uris, ['-samples=100', '-threads=4', `-config_file=${fileNames}`]);
                break;
            case 'lasso':
                // defaultCommandSyntax = `lasso ${fileNames}`;
                runTerminal(selectedCommand, uris, undefined, undefined, fileNames);
                break;
            case 'nca':
                // defaultCommandSyntax = `nca -samples=500 -columns=CL,V ${fileNames}`;
                runTerminal(selectedCommand, uris, ['-samples=500', '-columns=CL,V'], undefined, fileNames);
                break;
            case 'nonpb':
                // defaultCommandSyntax = `nonpb ${fileNames}`;
                runTerminal(selectedCommand, uris, undefined, undefined, fileNames);
                break;
            case 'mimp':
                // defaultCommandSyntax = `mimp ${fileNames}`;
                runTerminal(selectedCommand, uris, undefined, undefined, fileNames);
                break;
            case 'gls':
                // defaultCommandSyntax = `gls ${fileNames}`;
                runTerminal(selectedCommand, uris, undefined, undefined, fileNames);
                break;
            case 'parallel_retries':
                // defaultCommandSyntax = `parallel_retries -min_retries=10 -thread=5 -seed=12345 -degree=0.9 ${fileNames}`;
                runTerminal(selectedCommand, uris, ['-min_retries=10', '-thread=5', '-seed=12345', '-degree=0.9'], undefined, fileNames);
                break;
            case 'precond':
                // defaultCommandSyntax = `precond ${fileNames}`;
                runTerminal(selectedCommand, uris, undefined, undefined, fileNames);
                break;
            case 'update_inits':
                // defaultCommandSyntax = `update_inits ${fileNames} -out=${fileNames}`;
                runTerminal(`update_inits ${fileNames}`, uris, [`-out=${fileNames}`]);
                break;
        }
    }
    );
}

function runTerminal(selectedCommand: string, uris: vscode.Uri[], defaultOptions?: string[], selectedOptions?: vscode.QuickPickItem[], target?: string) {
    let optionsString = selectedOptions ? selectedOptions.map(opt => opt.label).join(' ') : '';
    optionsString = defaultOptions ? defaultOptions.join(' ') : optionsString;
    const targetString = target ? target : '';
    vscode.window.showInputBox({
        prompt: `Enter parameters for ${selectedCommand}:`,
        value: `${runDockerCommandPrefix()} ${selectedCommand} ${optionsString} ${targetString}`
    }).then(input => {
        if (input === undefined) {
            return;
        }
        const terminalName = path.basename(uris[0].fsPath); // 터미널 이름을 파일 이름으로 설정
        const shellPath = os.platform() === 'win32' ? 'cmd.exe' : undefined;

        const terminal = vscode.window.createTerminal({ name: terminalName, cwd: path.dirname(uris[0].fsPath), shellPath: shellPath });
        terminal.sendText(`${input}`);
        terminal.show();
    });
}
// Function For NONMEM run
export function showModFileContextMenuNONMEM(nodes: (vscode.Uri | (vscode.TreeItem & { uri: vscode.Uri }))[], context: vscode.ExtensionContext) {
    let uris: vscode.Uri[];

    if (isUriArray(nodes)) {
        uris = nodes;
    } else if (isTreeItemArray(nodes)) {
        uris = nodes.map(node => node.uri);
    } else {
        vscode.window.showErrorMessage('Invalid selection');
        return;
    }

    if (uris.length === 0) {
        vscode.window.showInformationMessage('No items selected.');
        return;
    }

    const fileNames = uris.map(uri => path.basename(uri.fsPath)).join(' ');
    const fileNamesLst = uris.map(uri => path.basename(uri.fsPath).replace(/\.(mod|ctl)$/i, '.lst')).join(' ');
    // const previousInput = context.globalState.get<string>('nonmemPath', '/opt/nm75/util/nmfe75');
    const nm_path = vscode.workspace.getConfiguration('nmbench').docker.container.nonmemPath;
    let defaultCommandSyntax = `${nm_path} ${fileNames} ${fileNamesLst}`;

    vscode.window.showInputBox({
        prompt: `Correct NONMEM path accordingly. ex) /opt/nm75/util/nmfe75 for v7.5.x:`,
        value: `${runDockerCommandPrefix()} ${defaultCommandSyntax}`
    }).then(input => {
        if (input) {
            // const [nonmemPath] = input.split(' ', 1);
            // context.globalState.update('nonmemPath', nonmemPath);
            const terminalName = path.basename(uris[0].fsPath); // 터미널 이름을 파일 이름으로 설정
            const shellPath = os.platform() === 'win32' ? 'cmd.exe' : undefined;

            const terminal = vscode.window.createTerminal({ name: terminalName, cwd: path.dirname(uris[0].fsPath), shellPath: shellPath });
            terminal.sendText(input);
            terminal.show();
        }
    });
}

// Running Rscript
export function showRScriptCommand(context: vscode.ExtensionContext, nodes: (vscode.Uri | (vscode.TreeItem & { uri: vscode.Uri }))[]) {
    let uris: vscode.Uri[];

    if (isUriArray(nodes)) {
        uris = nodes;
    } else if (isTreeItemArray(nodes)) {
        uris = nodes.map(node => node.uri);
    } else {
        vscode.window.showErrorMessage('Invalid selection');
        return;
    }

    if (uris.length === 0) {
        vscode.window.showInformationMessage('No items selected.');
        return;
    }

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

        const toForwardSlashPath = (inputPath: string): string => {
            return inputPath.replace(/\\/g, '/');
        };


        vscode.window.showQuickPick(scriptFiles, { placeHolder: 'Select an R script to execute' }).then(selected => {
            if (selected) {
                const firstUri = uris[0];
                let workingDir = path.dirname(firstUri.fsPath);
                workingDir = toForwardSlashPath(workingDir); // forward slash to the path

                const baseFileName = path.basename(firstUri.fsPath);

                const scriptPath = selected.description!;
                let scriptContent = fs.readFileSync(scriptPath, 'utf-8');

                scriptContent = scriptContent.replace(/nmbench_selec <- # MODEL_FILE_IN/g, `nmbench_selec <- "${baseFileName}"`);
                scriptContent = scriptContent.replace(/nmbench_wkdir <- # MODEL_FOLDER_IN/g, `nmbench_wkdir <- "${workingDir}"`);

                const scriptName = `temp_${path.basename(scriptPath)}`;
                const tempScriptPath = path.join(workingDir, scriptName);
                fs.writeFileSync(tempScriptPath, scriptContent);

                const terminalName = path.basename(uris[0].fsPath); // 터미널 이름을 파일 이름으로 설정
                const shellPath = os.platform() === 'win32' ? 'cmd.exe' : undefined;
                
                const terminal = vscode.window.createTerminal({ name: terminalName, cwd: path.dirname(uris[0].fsPath), shellPath: shellPath });
                terminal.sendText(`${runDockerCommandPrefix()} Rscript "${scriptName}"`);
                terminal.show();

                // setTimeout(() => {
                //     if (fs.existsSync(tempScriptPath)) {
                //         fs.unlinkSync(tempScriptPath);
                //     }
                // }, 20000); // 20 seconds delay before deleting the temporary script
            }
        });
    });
}