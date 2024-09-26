--!strict
local Citronella = {}
Citronella._breakpoints = {}

local function callCallbacks(id, data)
	local callbacks = Citronella._breakpoints[id]
	if callbacks == nil then
		return
	end
	for callback in callbacks do
		callback(data)
	end
end

function Citronella._register(sourceFile)
	return function(line, column, variables) -- could also fetch the line by parsing debug.traceback but that's evil
		return function(...)
			local data = {
				sourceFile = sourceFile,
				line = line,
				column = column,
				variables = variables,
			}
			callCallbacks(`{sourceFile}:{line}:{column}`, data)
			callCallbacks(`{sourceFile}:{line}:*`, data)
			callCallbacks(`{sourceFile}:*`, data)
			callCallbacks('*', data)
			return ...
		end
	end
end

function Citronella.hook(target, callback)
	if Citronella._breakpoints[target] == nil then
		Citronella._breakpoints[target] = {}
	end
	Citronella._breakpoints[target][callback] = true

	local Hook = {}

	function Hook.remove()
		Citronella._breakpoints[target][callback] = nil

		-- Remove the table if it's empty
		for _ in Citronella._breakpoints[target] do
			return
		end
		Citronella._breakpoints[target] = nil
	end

	return Hook
end

return Citronella
