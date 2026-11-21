#!/usr/bin/env bun
import { COMMANDS, type Command, USAGE } from "./index";

const isCommand = (value: string | undefined): value is Command =>
	COMMANDS.includes(value as Command);

const [command] = process.argv.slice(2);

console.log(USAGE);
if (command !== undefined && !isCommand(command)) {
	console.error(`\nUnknown command: ${command}`);
	process.exitCode = 1;
}
