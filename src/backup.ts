// function psnBootstrap(fileNames: string, selectedCommand: string, uris: vscode.Uri[]) {
//     vscode.window.showQuickPick([
//         { label: '-rplots=1', description: 'generate basic rplots after model run' },
//         { label: '-stratify_on=', description: 'stratification' },
//         { label: '-dir=', description: 'name direction for output' },
//         { label: '-keep covariance=', description: 'Keep $COV, can affect run time significantly' },
//         { label: '-allow_ignore_id', description: 'Program continues execution with IGNORE/ACCEPT statement' }
//     ], {
//         canPickMany: true,
//         placeHolder: 'Select optional commands to add'
//     }).then(selectedOptions => {
//         const optionsString = selectedOptions ? selectedOptions.map(opt => opt.label).join(' ') : '';
//         const shellPath = os.platform() === 'win32' ? 'cmd.exe' : undefined;

//         let defaultCommandSyntax = `bootstrap -samples=100 -threads=4 ${optionsString} ${fileNames}`;

//         vscode.window.showInputBox({
//             prompt: `Enter parameters for ${selectedCommand}:`,
//             value: defaultCommandSyntax
//         }).then(input => {
//             if (input) {
//                 const terminalName = path.basename(uris[0].fsPath); // 터미널 이름을 파일 이름으로 설정
//                 const terminal = vscode.window.createTerminal({ name: terminalName, cwd: path.dirname(uris[0].fsPath), shellPath: shellPath });
//                 terminal.sendText(`${input}`);
//                 terminal.show();
//             }
//         });
//     });
// }

// function psnVPC(fileNames: string, selectedCommand: string, uris: vscode.Uri[]) {
//     vscode.window.showQuickPick([
//         { label: '-rplots=1', description: 'generate basic rplots after model run' },
//         { label: '-predcorr', description: 'perform prediction corrected VPC' },
//         { label: '-stratify_on=', description: 'stratification' },
//         { label: '-varcorr', description: 'variability correction on DVs before computing' },
//         { label: '-dir=', description: 'name direction for output' }
//     ], {
//         canPickMany: true,
//         placeHolder: 'Select optional commands to add'
//     }).then(selectedOptions => {
//         const optionsString = selectedOptions ? selectedOptions.map(opt => opt.label).join(' ') : '';
//         const shellPath = os.platform() === 'win32' ? 'cmd.exe' : undefined;

//         let defaultCommandSyntax = `vpc -samples=200 -auto_bin=auto ${optionsString} ${fileNames}`;

//         vscode.window.showInputBox({
//             prompt: `Enter parameters for ${selectedCommand}:`,
//             value: defaultCommandSyntax
//         }).then(input => {
//             if (input) {
//                 const terminalName = path.basename(uris[0].fsPath); // 터미널 이름을 파일 이름으로 설정
//                 const terminal = vscode.window.createTerminal({ name: terminalName, cwd: path.dirname(uris[0].fsPath), shellPath: shellPath });
//                 terminal.sendText(`${input}`);
//                 terminal.show();
//             }
//         });
//     });
// }

// function psnExecute(fileNames: string, selectedCommand: string, uris: vscode.Uri[]) {
//     vscode.window.showQuickPick([
//         { label: '-rplots=1', description: 'generate basic rplots after model run' },
//         { label: '-zip', description: 'compressed results in .zip file' },
//         { label: '-display_iterations', description: 'display iterations' }
//     ], {
//         canPickMany: true,
//         placeHolder: 'Select optional commands to add'
//     }).then(selectedOptions => {
//         const optionsString = selectedOptions ? selectedOptions.map(opt => opt.label).join(' ') : '';
//         const shellPath = os.platform() === 'win32' ? 'cmd.exe' : undefined;
//         const docker_cmd = runDockerCommandPrefix();

//         let defaultCommandSyntax = `${docker_cmd} execute ${optionsString} ${fileNames}`;

//         // runTerminal(selectedCommand, defaultCommandSyntax, uris);

//         vscode.window.showInputBox({
//             prompt: `Enter parameters for ${selectedCommand}:`,
//             value: defaultCommandSyntax
//         }).then(input => {
//             if (input) {
//                 const terminalName = path.basename(uris[0].fsPath); // 터미널 이름을 파일 이름으로 설정
//                 const terminal = vscode.window.createTerminal({ name: terminalName, cwd: path.dirname(uris[0].fsPath), shellPath: shellPath });
//                 terminal.sendText(`${input}`);
//                 terminal.show();
//             }
//         });
//     });
// }