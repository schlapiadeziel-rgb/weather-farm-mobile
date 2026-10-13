package com.fieldletter.farm.update;

import androidx.core.content.FileProvider;

/** Separate provider identity prevents merging its narrow paths with the media provider. */
public final class UpdateFileProvider extends FileProvider {}
