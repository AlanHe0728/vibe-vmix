"""Build-time ZIP tools. Python is NOT shipped or needed by the recipient."""
import pathlib
import sys
import zipfile

mode, source, target = sys.argv[1:4]
source, target = pathlib.Path(source).resolve(), pathlib.Path(target).resolve()
if mode == 'extract':
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as archive:
        for item in archive.infolist():
            entry = (target / item.filename).resolve()
            if not entry.is_relative_to(target):
                raise ValueError('Archive entry outside destination')
        archive.extractall(target)
elif mode == 'zip':
    if target.exists():
        raise FileExistsError(target)
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for entry in sorted(source.rglob('*')):
            if entry.is_file():
                archive.write(entry, entry.relative_to(source.parent).as_posix())
    with zipfile.ZipFile(target) as archive:
        bad = archive.testzip()
        if bad:
            raise ValueError('Corrupt ZIP entry: ' + bad)
else:
    raise ValueError('Unknown archive operation')
print(mode + ': OK')
