"""Immutable wind source records and auditable publication-window imports."""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "observations",
        sa.Column("record_hash", sa.String(64), primary_key=True),
        sa.Column("dataset", sa.String(16), nullable=False),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("publish_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("generation_mw", sa.Float(), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_index(
        "ix_observation_lookup", "observations", ["dataset", "start_time", "publish_time"]
    )
    op.create_table(
        "ingestion_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("dataset", sa.String(16), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("window_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("source_url", sa.String(512), nullable=False),
        *[
            sa.Column(name, sa.Integer(), nullable=False)
            for name in ("fetched_count", "wind_count", "inserted_count", "rejected_count")
        ],
        sa.Column("error", sa.String(256)),
    )
    op.create_table(
        "ingestion_items",
        sa.Column("run_id", sa.String(36), sa.ForeignKey("ingestion_runs.id"), primary_key=True),
        sa.Column(
            "record_hash",
            sa.String(64),
            sa.ForeignKey("observations.record_hash"),
            primary_key=True,
        ),
    )


def downgrade():
    op.drop_table("ingestion_items")
    op.drop_table("ingestion_runs")
    op.drop_index("ix_observation_lookup", table_name="observations")
    op.drop_table("observations")
