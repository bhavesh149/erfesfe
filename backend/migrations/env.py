from alembic import context

from app.core.config import Settings
from app.core.db import Base, make_engine

target_metadata = Base.metadata

if context.is_offline_mode():
    context.configure(
        url=Settings().database_url, target_metadata=target_metadata, literal_binds=True
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = make_engine(Settings().database_url)
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=engine.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()
