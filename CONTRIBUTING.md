# Contributing to VIC

Thanks for taking the time to contribute! 🚀

## How Can I Contribute?

### Reporting Bugs

1. Check if the bug is already reported in [Issues](https://github.com/oddsifylabs/vic/issues)
2. If not, open a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Your OS, Node version (`node --version`), and browser
   - Screenshots if applicable

### Suggesting Features

Open a [Discussion](https://github.com/oddsifylabs/vic/discussions) or an Issue with the `enhancement` label. Describe:
- The problem you're solving
- How you'd expect it to work
- Any similar tools that do this well

### Pull Requests

1. **Fork** the repo
2. **Create a branch** from `main`: `git checkout -b feature/my-feature`
3. **Make your changes**
4. **Test locally**: `node proxy.js` → verify the page loads and your change works
5. **Commit** with a clear message
6. **Push** and open a Pull Request

#### Code Style

- Keep it simple — vanilla JS, no frameworks
- Match existing patterns in `proxy.js` and `vic.js`
- Use `try/catch` on all `await` calls
- Log errors via `addLog()` in `proxy.js`
- Frontend errors should be user-friendly

#### What We're Looking For

- 🔧 **New data sources** (additional sportsbooks, injury feeds, weather APIs)
- 🎨 **UI/UX improvements** (especially mobile responsiveness)
- 📊 **New betting tools** (calculators, models, visualizations)
- 📝 **Documentation** (README improvements, setup guides, video tutorials)
- 🤖 **Docker / deployment configs** (Dockerfile, K8s, AWS, etc.)
- 🔐 **Security fixes** (always welcome, always prioritized)

## Development Setup

```bash
git clone https://github.com/oddsifylabs/vic.git
cd vic
npm install
node proxy.js
# open http://localhost:3747
```

## Questions?

Drop them in [Discussions](https://github.com/oddsifylabs/vic/discussions) or DM [@oddsifylabs](https://twitter.com/oddsifylabs).
