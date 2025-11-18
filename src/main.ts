import { simpleGit } from 'simple-git';
import fs from 'fs';

const fsp = fs.promises;

export interface RegistrCache {
	lastProcessedCommit: string;
	lastCacheUpdate: string;
}

export class RegistryTool {
	private git: ReturnType<typeof simpleGit>;
	private cache: RegistrCache;
	constructor(private repoPath: string, private cachePath: string) {
		this.git = simpleGit(repoPath);
		this.cache = this.loadCache(cachePath);
	}

	loadCache(cachePath: string): RegistrCache {
		try {
			const cacheData = fs.readFileSync(cachePath, 'utf-8');
			return JSON.parse(cacheData) as RegistrCache;
		} catch {
			return { lastProcessedCommit: '', lastCacheUpdate: '' };
		}
	}

	async updateCache(latestCommit: string) {
		this.cache.lastProcessedCommit = latestCommit;
		this.cache.lastCacheUpdate = new Date().toISOString();
		await fsp.writeFile(this.cachePath, JSON.stringify(this.cache, null, 2), 'utf-8');
	}

	getCache(): RegistrCache {
		return this.cache;
	}

	async moveHeadToLastCommit() {
		await this.git.reset(['--hard', 'HEAD']);
	}

	/*
	 * Get list of commit hashes until (but not including) the specified commit hash
	 */
	async getListOfCommitsUntil(commitHash: string): Promise<string[]> {
		const log = await this.git.log();
		const commits: string[] = [];
		for (const entry of log.all) {
			if (entry.hash === commitHash) {
				break;
			}
			commits.push(entry.hash);
		}
		return commits;
	}

	async doInCommitHash(commitHash: string, action: () => Promise<void>) {
		await this.git.checkout(commitHash);
		await action();
		await this.git.checkout('HEAD');
	}

	async generateRegistry(forceAll = false) {
		await this.moveHeadToLastCommit();
		if (forceAll) {
			this.cache.lastProcessedCommit = '';
		}
		const commitsToProcess = await this.getListOfCommitsUntil(this.cache.lastProcessedCommit);
		if (commitsToProcess.length === 0) {
			console.log('No new commits to process.');
			process.exit(0);
		}

		console.log(`Processing ${commitsToProcess.length} commits...`);
		for (const commitHash of commitsToProcess.toReversed()) {
			await this.doInCommitHash(commitHash, async () => {
				const log = await this.git.log({ n: 1 });
				console.log(`Processing commit: ${log.latest?.hash} - ${log.latest?.message} from date ${log.latest?.date}`);
				// list files in the repo at this commit
				const files = await fsp.readdir(this.repoPath);
				console.log('Files at this commit:', files);
				// now use normal fs listing to read file contents
				for (const filePath of files) {
					try {
						const content = await fsp.readFile(`${this.repoPath}/${filePath}`, 'utf-8');
						console.log(`Content of ${filePath}:\n`, content);
					} catch (err) {
						// skip non-files (directories)
					}
				}
			});
		}
		await this.moveHeadToLastCommit();
		await this.updateCache(commitsToProcess[0]);
	}
}
