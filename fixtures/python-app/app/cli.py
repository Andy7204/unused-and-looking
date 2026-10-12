import click


@click.command()
def main():
    """TRAP: CLI entrypoint registered by decorator and by pyproject."""
    click.echo("hi")


def run_migrations():
    """TRAP: referenced only from pyproject.toml scripts as app.cli:run_migrations."""
    return True
